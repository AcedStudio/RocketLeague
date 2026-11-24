import "server-only";
import type { PoolClient } from "@neondatabase/serverless";
import { q, one, tx, lockCompetition } from "./db";
import { FormError } from "./errors";
import { notify, matchEvent, logAction } from "./notify";
import { isReferee, type User } from "./auth";

// Match referees are picked from the competition's own players: whoever doesn't play
// in a match can referee it. The referee enters the official score.

export type Candidate = { user_id: string; nickname: string; entry_id: string; refereed: number };

/** Players of the competition (confirmed entries) with how many matches each referees. */
export async function refereeCandidates(competitionId: string, c?: PoolClient): Promise<Candidate[]> {
  return q<Candidate>(
    `select u.id as user_id, u.rl_nickname as nickname, em.entry_id,
            (select count(*)::int from matches m where m.competition_id = $1 and m.referee_user_id = u.id) as refereed
       from entries e join entry_members em on em.entry_id = e.id and em.active join users u on u.id = em.user_id
      where e.competition_id = $1 and e.status = 'confirmed'
      order by u.rl_nickname`,
    [competitionId],
    c,
  );
}

type M = { id: string; number: number; round: number; stage: string; status: string; home_entry_id: string | null; away_entry_id: string | null; referee_user_id: string | null; home: string | null; away: string | null };

async function loadMatch(c: PoolClient, competitionId: string, matchId: string) {
  const m = await one<M>(
    `select m.id, m.number, m.round, m.stage, m.status, m.home_entry_id, m.away_entry_id, m.referee_user_id, he.name as home, ae.name as away
       from matches m left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
      where m.id = $1 and m.competition_id = $2`,
    [matchId, competitionId],
    c,
  );
  if (!m) throw new FormError("Матч не найден");
  return m;
}

async function playsIn(c: PoolClient, userId: string, m: M) {
  return !!(await one(
    "select 1 from entry_members where user_id = $1 and active and entry_id = any($2::uuid[])",
    [userId, [m.home_entry_id, m.away_entry_id].filter(Boolean)],
    c,
  ));
}

async function setReferee(c: PoolClient, m: M, userId: string | null, actor: User | null, slug: string) {
  if (m.referee_user_id === userId) return false;
  if (userId && (await playsIn(c, userId, m))) throw new FormError("Матч #{n}: игрок не может судить свой матч", { n: m.number });
  await q("update matches set referee_user_id = $2, updated_at = now() where id = $1", [m.id, userId], c);
  const link = `/match/${m.id}`;
  if (userId) {
    const ref = await one<{ rl_nickname: string }>("select rl_nickname from users where id = $1", [userId], c);
    await matchEvent(c, m.id, actor?.id ?? null, "Назначен судья: {name}", { name: ref?.rl_nickname ?? "" });
    await notify(c, [userId], "Вы судья матча #{n}", "{home} — {away} · тур {round}. Счёт вносите вы на странице матча.", link, { n: m.number, home: m.home ?? "?", away: m.away ?? "?", round: m.round });
    const players = await q<{ user_id: string }>("select user_id from entry_members where active and entry_id = any($1::uuid[])", [[m.home_entry_id, m.away_entry_id].filter(Boolean)], c);
    await notify(c, players.map((p) => p.user_id), "Матч #{n}: судья — {name}", "Сыграйте матч при судье: он внесёт счёт", link, { n: m.number, name: ref?.rl_nickname ?? "" });
  } else {
    await matchEvent(c, m.id, actor?.id ?? null, "Судья снят");
  }
  void slug;
  return true;
}

/** Saves the admin's choices: { matchId: userId | "" }. Returns how many changed. */
export async function assignReferees(competitionId: string, choices: Record<string, string>, actor: User): Promise<number> {
  return tx(async (c) => {
    await lockCompetition(c, competitionId);
    const comp = await one<{ slug: string; name: string }>("select slug, name from competitions where id = $1", [competitionId], c);
    if (!comp) throw new FormError("Соревнование не найдено");
    const candidates = new Set((await refereeCandidates(competitionId, c)).map((x) => x.user_id));
    let changed = 0;
    for (const [matchId, userId] of Object.entries(choices)) {
      const m = await loadMatch(c, competitionId, matchId);
      if (m.status === "completed" && m.referee_user_id && userId !== m.referee_user_id) continue; // history stays
      if (userId && !candidates.has(userId)) throw new FormError("Судьёй может быть только участник соревнования");
      if (await setReferee(c, m, userId || null, actor, comp.slug)) changed++;
    }
    if (changed) await logAction(c, actor.id, "referee.assign", `${comp.name}: ${changed}`);
    return changed;
  });
}

/**
 * Fills the empty referee slots of one tour fairly: players resting in that tour first,
 * nobody twice in the same tour if avoidable, then whoever has refereed least.
 */
export async function autoAssignReferees(competitionId: string, stage: string, round: number, actor: User): Promise<number> {
  return tx(async (c) => {
    await lockCompetition(c, competitionId);
    const comp = await one<{ slug: string; name: string }>("select slug, name from competitions where id = $1", [competitionId], c);
    if (!comp) throw new FormError("Соревнование не найдено");
    const ms = await q<M>(
      `select m.id, m.number, m.round, m.stage, m.status, m.home_entry_id, m.away_entry_id, m.referee_user_id, he.name as home, ae.name as away
         from matches m left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where m.competition_id = $1 and m.stage = $2 and m.round = $3 and not m.is_bye
          and m.home_entry_id is not null and m.away_entry_id is not null order by m.number`,
      [competitionId, stage, round],
      c,
    );
    const pool = await refereeCandidates(competitionId, c);
    const load = new Map(pool.map((p) => [p.user_id, p.refereed]));
    const playingEntries = new Set(ms.flatMap((m) => [m.home_entry_id, m.away_entry_id]));
    const busy = new Set(ms.map((m) => m.referee_user_id).filter(Boolean) as string[]);
    let assigned = 0;
    for (const m of ms) {
      if (m.referee_user_id || m.status === "completed") continue;
      const eligible = pool.filter((p) => p.entry_id !== m.home_entry_id && p.entry_id !== m.away_entry_id);
      if (!eligible.length) continue;
      eligible.sort(
        (a, b) =>
          Number(playingEntries.has(a.entry_id)) - Number(playingEntries.has(b.entry_id)) || // resting first
          Number(busy.has(a.user_id)) - Number(busy.has(b.user_id)) || // not already refereeing this tour
          (load.get(a.user_id) ?? 0) - (load.get(b.user_id) ?? 0) ||
          a.nickname.localeCompare(b.nickname),
      );
      const pick = eligible[0];
      await setReferee(c, m, pick.user_id, actor, comp.slug);
      busy.add(pick.user_id);
      load.set(pick.user_id, (load.get(pick.user_id) ?? 0) + 1);
      assigned++;
    }
    if (assigned) await logAction(c, actor.id, "referee.auto", `${comp.name}: ${stage} ${round} → ${assigned}`);
    return assigned;
  });
}

/** Staff can referee anything; a player only the matches they were assigned to. */
export function canReferee(user: Pick<User, "id" | "role"> | null | undefined, m: { referee_user_id: string | null }) {
  return !!user && (isReferee(user.role) || m.referee_user_id === user.id);
}
