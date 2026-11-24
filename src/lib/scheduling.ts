import "server-only";
import type { PoolClient } from "@neondatabase/serverless";
import { q, one, tx, lockCompetition } from "./db";
import { FormError } from "./errors";
import { notify, notifyEntries, matchEvent, logAction } from "./notify";
import { applyResult } from "./tournament";

// Players agree on a match time themselves: one side proposes, the other accepts.
// At the agreed time both sides check in; whoever doesn't show up within the
// competition's grace period loses by forfeit. A round deadline (play_by) forces
// a decision: the side that never answered the opponent's proposals forfeits.

export const CHECKIN_OPENS_MIN = 30;
export const MAX_PENDING_PER_SIDE = 3;
const MIN_LEAD_MIN = 15;

type M = {
  id: string; number: number; competition_id: string; status: string; is_bye: boolean;
  home_entry_id: string | null; away_entry_id: string | null; scheduled_at: Date | null; play_by: Date | null;
  time_confirmed: boolean; home_checkin_at: Date | null; away_checkin_at: Date | null;
  timezone: string; comp: string; draw_state: string; noshow_minutes: number; deadline_forfeit: boolean;
  referee_user_id: string | null;
};

async function lockMatch(c: PoolClient, matchId: string): Promise<M> {
  // Same order as result confirmation (competition, then match) so the two never deadlock.
  const pre = await one<{ competition_id: string }>("select competition_id from matches where id = $1", [matchId], c);
  if (!pre) throw new FormError("Матч не найден");
  await lockCompetition(c, pre.competition_id);
  await q("select id from matches where id = $1 for update", [matchId], c);
  const m = await one<M>(
    `select m.id, m.number, m.competition_id, m.status, m.is_bye, m.home_entry_id, m.away_entry_id, m.scheduled_at, m.play_by,
            m.referee_user_id, m.time_confirmed, m.home_checkin_at, m.away_checkin_at, c.timezone, c.name as comp, c.draw_state, c.noshow_minutes, c.deadline_forfeit
       from matches m join competitions c on c.id = m.competition_id where m.id = $1`,
    [matchId],
    c,
  );
  if (!m) throw new FormError("Матч не найден");
  return m;
}

async function sideOf(c: PoolClient, m: M, userId: string): Promise<"home" | "away"> {
  const r = await one<{ entry_id: string }>(
    "select entry_id from entry_members where user_id = $1 and active and entry_id = any($2::uuid[])",
    [userId, [m.home_entry_id, m.away_entry_id].filter(Boolean)],
    c,
  );
  if (!r) throw new FormError("Это могут сделать только участники матча");
  return r.entry_id === m.home_entry_id ? "home" : "away";
}

function assertOpen(m: M) {
  if (m.is_bye || !m.home_entry_id || !m.away_entry_id) throw new FormError("Соперники ещё не определены");
  if (m.draw_state !== "published") throw new FormError("Жеребьёвка ещё не опубликована");
  if (["completed", "under_review"].includes(m.status)) throw new FormError("Матч уже сыгран или на рассмотрении");
}

const when = (at: Date, tz: string) => ({ at: at.toISOString(), tz });

export async function proposeTime(matchId: string, userId: string, at: Date): Promise<string> {
  return tx(async (c) => {
    const m = await lockMatch(c, matchId);
    assertOpen(m);
    const side = await sideOf(c, m, userId);
    if (at.getTime() < Date.now() + MIN_LEAD_MIN * 60_000) throw new FormError("Предложите время хотя бы на {n} минут вперёд", { n: MIN_LEAD_MIN });
    if (m.play_by && at > m.play_by) throw new FormError("Матч нужно сыграть до срока: {when}", when(m.play_by, m.timezone));
    const mine = side === "home" ? m.home_entry_id! : m.away_entry_id!;
    const other = side === "home" ? m.away_entry_id! : m.home_entry_id!;
    const pending = await one<{ n: number }>("select count(*)::int as n from match_proposals where match_id = $1 and entry_id = $2 and status = 'pending'", [m.id, mine], c);
    if (pending!.n >= MAX_PENDING_PER_SIDE) throw new FormError("Не больше {n} предложений одновременно — отзовите старое", { n: MAX_PENDING_PER_SIDE });
    const dup = await one("select 1 from match_proposals where match_id = $1 and status = 'pending' and at = $2", [m.id, at], c);
    if (dup) throw new FormError("Это время уже предложено");
    const p = await one<{ id: string }>(
      "insert into match_proposals (match_id, entry_id, proposed_by, at) values ($1, $2, $3, $4) returning id",
      [m.id, mine, userId, at],
      c,
    );
    await matchEvent(c, m.id, userId, "Предложено время: {when}", when(at, m.timezone));
    await notifyEntries(c, [other], "Матч #{n}: соперник предлагает время", "{when}", `/match/${m.id}`, { n: m.number, ...when(at, m.timezone) }, [
      { label: "Принять", id: `acc:${p!.id}`, style: 3 },
      { label: "Отклонить", id: `dec:${p!.id}`, style: 4 },
    ]);
    return "Предложение отправлено сопернику";
  });
}

export async function respondProposal(proposalId: string, userId: string, accept: boolean): Promise<string> {
  return tx(async (c) => {
    const p = await one<{ match_id: string; entry_id: string; at: Date; status: string }>("select match_id, entry_id, at, status from match_proposals where id = $1", [proposalId], c);
    if (!p) throw new FormError("Предложение не найдено");
    const m = await lockMatch(c, p.match_id);
    const fresh = await one<{ status: string }>("select status from match_proposals where id = $1", [proposalId], c);
    if (fresh!.status !== "pending") throw new FormError("На это предложение уже ответили");
    assertOpen(m);
    const side = await sideOf(c, m, userId);
    const mine = side === "home" ? m.home_entry_id : m.away_entry_id;
    if (mine === p.entry_id) throw new FormError("Ответить может только соперник");
    if (accept) {
      if (p.at.getTime() < Date.now()) throw new FormError("Это время уже прошло — предложите новое");
      await q("update match_proposals set status = 'accepted', responded_by = $2, responded_at = now() where id = $1", [proposalId, userId], c);
      await q("update match_proposals set status = 'expired', responded_at = now() where match_id = $1 and status = 'pending'", [m.id], c);
      await q(
        `update matches set scheduled_at = $2, time_confirmed = true, home_checkin_at = null, away_checkin_at = null,
                remind60_at = null, remind10_at = null, reminded_at = null, auto_handled_at = null, updated_at = now() where id = $1`,
        [m.id, p.at],
        c,
      );
      await matchEvent(c, m.id, userId, "Время согласовано: {when}", when(p.at, m.timezone));
      await notifyEntries(c, [m.home_entry_id, m.away_entry_id], "Матч #{n}: время согласовано", "{when}", `/match/${m.id}`, { n: m.number, ...when(p.at, m.timezone) });
      if (m.referee_user_id) await notify(c, [m.referee_user_id], "Матч #{n}: время согласовано", "Вы судья этого матча · {when}", `/match/${m.id}`, { n: m.number, ...when(p.at, m.timezone) });
      return "Время согласовано";
    }
    await q("update match_proposals set status = 'declined', responded_by = $2, responded_at = now() where id = $1", [proposalId, userId], c);
    await matchEvent(c, m.id, userId, "Соперник отклонил время {when}", when(p.at, m.timezone));
    await notifyEntries(c, [p.entry_id], "Матч #{n}: соперник отклонил время", "{when}", `/match/${m.id}`, { n: m.number, ...when(p.at, m.timezone) });
    return "Предложение отклонено";
  });
}

export async function withdrawProposal(proposalId: string, userId: string): Promise<string> {
  return tx(async (c) => {
    const p = await one<{ match_id: string; entry_id: string; status: string }>("select match_id, entry_id, status from match_proposals where id = $1", [proposalId], c);
    if (!p || p.status !== "pending") throw new FormError("Предложение не найдено");
    const m = await lockMatch(c, p.match_id);
    const side = await sideOf(c, m, userId);
    if ((side === "home" ? m.home_entry_id : m.away_entry_id) !== p.entry_id) throw new FormError("Отозвать можно только своё предложение");
    await q("update match_proposals set status = 'withdrawn', responded_at = now() where id = $1", [proposalId], c);
    return "Предложение отозвано";
  });
}

export function checkinWindow(m: { scheduled_at: Date | null; noshow_minutes: number }) {
  if (!m.scheduled_at) return null;
  const at = new Date(m.scheduled_at).getTime();
  return { opens: new Date(at - CHECKIN_OPENS_MIN * 60_000), closes: new Date(at + Math.max(m.noshow_minutes, 5) * 60_000) };
}

export async function checkIn(matchId: string, userId: string): Promise<string> {
  return tx(async (c) => {
    const m = await lockMatch(c, matchId);
    assertOpen(m);
    const side = await sideOf(c, m, userId);
    const w = checkinWindow(m);
    if (!w) throw new FormError("Время матча ещё не назначено");
    const now = Date.now();
    if (now < w.opens.getTime()) throw new FormError("Отметиться можно за {n} минут до начала", { n: CHECKIN_OPENS_MIN });
    if (now > w.closes.getTime()) throw new FormError("Время для отметки вышло");
    if ((side === "home" ? m.home_checkin_at : m.away_checkin_at) !== null) return "Вы уже отметились";
    await q(`update matches set ${side}_checkin_at = now(), status = case when status = 'upcoming' then 'ready' else status end, updated_at = now() where id = $1`, [m.id], c);
    await matchEvent(c, m.id, userId, "Игрок на месте");
    const other = side === "home" ? m.away_entry_id : m.home_entry_id;
    const otherIn = side === "home" ? m.away_checkin_at : m.home_checkin_at;
    if (!otherIn) {
      await notifyEntries(c, [other], "Матч #{n}: соперник на месте", "Отметьтесь на странице матча, иначе через {min} мин. после начала засчитается техническое поражение", `/match/${m.id}`, { n: m.number, min: m.noshow_minutes }, [
        { label: "Я на месте", id: `in:${m.id}`, style: 3 },
      ]);
    }
    return "Отмечено: вы на месте";
  });
}

// ---------------------------------------------------------------- automatic work

async function staffIds(c: PoolClient) {
  return (await q<{ id: string }>("select id from users where role in ('superadmin', 'admin', 'referee')", [], c)).map((r) => r.id);
}

/**
 * Sends reminders and applies no-show / deadline forfeits. Idempotent and throttled:
 * safe to call from the 5-minute GitHub Actions tick, page views and bot commands.
 */
export async function sweep(force = false): Promise<{ reminded: number; forfeits: number; flagged: number }> {
  const out = { reminded: 0, forfeits: 0, flagged: 0 };
  if (!force) {
    const claimed = await one<{ ok: boolean }>(
      `insert into settings (key, value) values ('sweep_at', now()::text)
       on conflict (key) do update set value = excluded.value
         where settings.value::timestamptz < now() - interval '50 seconds'
       returning true as ok`,
    );
    if (!claimed) return out;
  }

  // 1. Reminders: an hour before, and 10 minutes before with a check-in button.
  for (const [col, minutes, title, buttons] of [
    ["remind60_at", 65, "Матч #{n} через час", false],
    ["remind10_at", 12, "Матч #{n} через 10 минут", true],
  ] as const) {
    const due = await q<{ id: string; number: number; scheduled_at: Date; home_entry_id: string; away_entry_id: string; timezone: string; comp: string; referee_user_id: string | null }>(
      `update matches m set ${col} = now() from competitions c
        where c.id = m.competition_id and m.${col} is null and m.status in ('upcoming', 'ready', 'live') and not m.is_bye
          and m.home_entry_id is not null and m.away_entry_id is not null and c.draw_state = 'published'
          and m.scheduled_at between now() and now() + interval '${minutes} minutes'
        returning m.id, m.number, m.scheduled_at, m.home_entry_id, m.away_entry_id, c.timezone, c.name as comp, m.referee_user_id`,
    );
    for (const m of due) {
      await notifyEntries(undefined, [m.home_entry_id, m.away_entry_id], title, "{comp} · {when}", `/match/${m.id}`, { n: m.number, comp: m.comp, ...when(m.scheduled_at, m.timezone) },
        buttons ? [{ label: "Я на месте", id: `in:${m.id}`, style: 3 }] : undefined);
      if (m.referee_user_id) await notify(undefined, [m.referee_user_id], title, "Вы судья этого матча · {comp} · {when}", `/match/${m.id}`, { n: m.number, comp: m.comp, ...when(m.scheduled_at, m.timezone) });
      out.reminded++;
    }
  }

  // 2. No-shows: grace period after the start is over and nobody reported a result.
  const noshows = await q<{ id: string }>(
    `select m.id from matches m join competitions c on c.id = m.competition_id
      where c.noshow_minutes > 0 and c.draw_state = 'published' and m.auto_handled_at is null and not m.is_bye
        and m.status in ('upcoming', 'ready', 'live') and m.scheduled_at is not null
        and m.home_entry_id is not null and m.away_entry_id is not null
        and m.scheduled_at + make_interval(mins => c.noshow_minutes) < now()
        and m.scheduled_at > now() - interval '3 days'
        and not exists (select 1 from match_reports r where r.match_id = m.id and r.status = 'pending')
      limit 20`,
  );
  for (const { id } of noshows) {
    await tx(async (c) => {
      const m = await lockMatch(c, id);
      if (["completed", "under_review"].includes(m.status)) return;
      await q("update matches set auto_handled_at = now() where id = $1", [m.id], c);
      const h = !!m.home_checkin_at, a = !!m.away_checkin_at;
      if (h !== a) {
        await applyResult(c, m.id, { games: [], forfeitWinner: h ? "home" : "away" }, null, "Техническое поражение: соперник не пришёл за {min} мин.", { min: m.noshow_minutes });
        out.forfeits++;
      } else if (!h && !a) {
        await matchEvent(c, m.id, null, "Никто не отметился к началу матча");
        await notify(c, await staffIds(c), "Матч #{n}: никто не отметился", "{comp} · {when}", `/match/${m.id}`, { n: m.number, comp: m.comp, ...when(m.scheduled_at!, m.timezone) });
        out.flagged++;
      }
      // Both checked in: they are playing — waiting for their report.
    });
  }

  // 3. Round deadline passed without an agreed time.
  const late = await q<{ id: string }>(
    `select m.id from matches m join competitions c on c.id = m.competition_id
      where m.play_by is not null and m.play_by < now() and m.auto_handled_at is null and not m.is_bye
        and c.draw_state = 'published' and m.status in ('upcoming', 'ready', 'live') and not m.time_confirmed
        and m.home_entry_id is not null and m.away_entry_id is not null
        and not exists (select 1 from match_reports r where r.match_id = m.id and r.status = 'pending')
      limit 20`,
  );
  for (const { id } of late) {
    await tx(async (c) => {
      const m = await lockMatch(c, id);
      if (["completed", "under_review"].includes(m.status) || m.time_confirmed) return;
      await q("update matches set auto_handled_at = now() where id = $1", [m.id], c);
      await q("update match_proposals set status = 'expired', responded_at = now() where match_id = $1 and status = 'pending'", [m.id], c);
      // Who tried? A side "tried" if it proposed or answered anything.
      const tried = await q<{ entry_id: string }>(
        `select distinct p.entry_id from match_proposals p where p.match_id = $1
         union select em.entry_id from match_proposals p join entry_members em on em.user_id = p.responded_by and em.active
          where p.match_id = $1 and em.entry_id in ($2, $3)`,
        [m.id, m.home_entry_id, m.away_entry_id],
        c,
      );
      const h = tried.some((r) => r.entry_id === m.home_entry_id), a = tried.some((r) => r.entry_id === m.away_entry_id);
      if (m.deadline_forfeit && h !== a) {
        await applyResult(c, m.id, { games: [], forfeitWinner: h ? "home" : "away" }, null, "Техническое поражение: соперник не договорился о времени до срока");
        out.forfeits++;
      } else {
        await matchEvent(c, m.id, null, "Срок матча истёк, время не согласовано");
        await notify(c, await staffIds(c), "Матч #{n}: срок истёк", "{comp} · время не согласовано", `/match/${m.id}`, { n: m.number, comp: m.comp });
        out.flagged++;
      }
    });
  }
  if (out.forfeits || out.flagged) await logAction(undefined, null, "sweep", JSON.stringify(out));
  return out;
}
