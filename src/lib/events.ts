import "server-only";
import { q, one, tx } from "./db";
import { FormError } from "./errors";
import { currentEvent, eventEnd, eventPoints, eventStart, findEvent, type EventActivity, type GameEvent } from "./engine/events";

// Points for everyone (or one user) inside an event window, in one query.
const POINTS_SQL = `
  with w as (select $1::timestamptz as f, $2::timestamptz as t),
  m as (
    select em.user_id, count(*)::int as matches, count(*) filter (where m.winner_entry_id = em.entry_id)::int as wins
      from matches m join entry_members em on em.active and em.entry_id in (m.home_entry_id, m.away_entry_id), w
     where m.status = 'completed' and not m.is_bye and m.completed_at >= w.f and m.completed_at < w.t
     group by em.user_id),
  d as (
    select u.id as user_id, count(*)::int as duels, count(*) filter (where d.winner_id = u.id)::int as duel_wins
      from duels d join users u on u.id in (d.challenger_id, d.opponent_id), w
     where d.status = 'completed' and d.completed_at >= w.f and d.completed_at < w.t
     group by u.id),
  r as (
    select referee_user_id as user_id, count(*)::int as refereed from matches, w
     where referee_user_id is not null and status = 'completed' and not forfeit and completed_at >= w.f and completed_at < w.t
     group by referee_user_id),
  c as (
    select user_id, count(*)::int as checkin from coin_bonuses, w
     where reason = 'daily' and created_at >= w.f and created_at < w.t group by user_id),
  ids as (select user_id from m union select user_id from d union select user_id from r union select user_id from c)
  select ids.user_id, coalesce(m.matches, 0) as matches, coalesce(m.wins, 0) as wins, coalesce(d.duels, 0) as duels,
         coalesce(d.duel_wins, 0) as "duelWins", coalesce(r.refereed, 0) as refereed, coalesce(c.checkin, 0) as checkin
    from ids left join m using (user_id) left join d using (user_id) left join r using (user_id) left join c using (user_id)`;

type Row = EventActivity & { user_id: string };

async function activity(e: GameEvent, userId?: string) {
  return q<Row>(userId ? `select * from (${POINTS_SQL}) x where user_id = $3` : POINTS_SQL, userId ? [eventStart(e), eventEnd(e), userId] : [eventStart(e), eventEnd(e)]);
}

export async function eventState(userId: string | null, e: GameEvent | null = currentEvent()) {
  if (!e) return null;
  const [mine, claimed] = userId
    ? await Promise.all([activity(e, userId), q<{ ref: string }>("select ref from coin_bonuses where user_id = $1 and reason = 'event' and ref like $2 || ':%'", [userId, e.key])])
    : [[], []];
  const act: EventActivity = mine[0] ?? { matches: 0, wins: 0, duels: 0, duelWins: 0, refereed: 0, checkin: 0 };
  const points = eventPoints(act);
  const done = new Set(claimed.map((c) => c.ref));
  const now = Date.now();
  return {
    event: e,
    act,
    points,
    live: eventStart(e).getTime() <= now && now < eventEnd(e).getTime(),
    endsAt: eventEnd(e),
    milestones: e.milestones.map((m, i) => ({ ...m, ref: `${e.key}:${i}`, reached: points >= m.points, claimed: done.has(`${e.key}:${i}`) })),
  };
}

export async function eventLeaderboard(e: GameEvent, limit = 10) {
  const rows = (await activity(e)).map((r) => ({ ...r, points: eventPoints(r) })).sort((a, b) => b.points - a.points).slice(0, limit);
  if (!rows.length) return [];
  const users = await q<{ id: string; rl_nickname: string; avatar: string | null; name_color: string | null }>(
    "select id, rl_nickname, avatar, name_color from users where id = any($1::uuid[])",
    [rows.map((r) => r.user_id)],
  );
  return rows.map((r) => ({ ...r, user: users.find((u) => u.id === r.user_id)! })).filter((r) => r.user);
}

export async function claimMilestone(userId: string, ref: string) {
  const [key, idx] = ref.split(":");
  const e = findEvent(key);
  const m = e?.milestones[Number(idx)];
  if (!e || !m) throw new FormError("Такой награды нет");
  // Rewards can be collected until a week after the event ends.
  if (Date.now() > eventEnd(e).getTime() + 7 * 86400_000) throw new FormError("Событие закончилось");
  const st = (await eventState(userId, e))!;
  if (st.points < m.points) throw new FormError("Нужно ещё {n} очков события", { n: m.points - st.points });
  return tx(async (c) => {
    const row = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'event', $3) on conflict do nothing returning id", [userId, m.reward.coins, ref], c);
    if (!row) throw new FormError("Награда уже получена");
    if (m.reward.item) await q("insert into purchases (user_id, item, price) values ($1, $2, 0) on conflict do nothing", [userId, m.reward.item], c);
    return m;
  });
}
