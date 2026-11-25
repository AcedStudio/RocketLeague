import "server-only";
import { q, one, type Queryable } from "./db";
import { notify } from "./notify";
import { enqueueChannel } from "./discord";
import { evaluate, ACHIEVEMENTS, type AchievementFacts, type AchievementState } from "./engine/achievements.ts";
import type { MatchLine } from "./engine/card.ts";

type Row = { side: "home" | "away"; won: boolean; forfeit: boolean; games: { home: number; away: number }[] | null };

export async function achievementFacts(userId: string, c?: Queryable): Promise<AchievementFacts> {
  const [rows, titles, awards, refs, peak] = await Promise.all([
    q<Row>(
      `with mine as (select entry_id from entry_members where user_id = $1 and active)
       select case when m.home_entry_id in (select entry_id from mine) then 'home' else 'away' end as side,
              m.winner_entry_id in (select entry_id from mine) as won, m.forfeit, m.games
         from matches m
        where m.status = 'completed' and not m.is_bye
          and (m.home_entry_id in (select entry_id from mine) or m.away_entry_id in (select entry_id from mine))
        order by coalesce(m.completed_at, m.updated_at), m.number`,
      [userId],
      c,
    ),
    one<{ n: number }>(
      `select count(*)::int as n from competitions c join entry_members em on em.entry_id = c.champion_entry_id and em.active
        where c.champion_entry_id is not null and em.user_id = $1`,
      [userId],
      c,
    ),
    one<{ n: number }>("select count(*)::int as n from tour_polls where winner_id = $1", [userId], c),
    one<{ n: number }>("select count(*)::int as n from matches where referee_user_id = $1 and status = 'completed' and not forfeit", [userId], c),
    one<{ peak: number | null }>(
      `select max(r)::int as peak from (select 1000 + sum(delta) over (partition by mode order by created_at, id) as r from rating_changes where user_id = $1) s`,
      [userId],
      c,
    ),
  ]);
  const lines: MatchLine[] = rows.map((r) => ({
    won: r.won,
    forfeit: r.forfeit,
    games: (r.games ?? []).map((g) => (r.side === "home" ? { gf: g.home, ga: g.away } : { gf: g.away, ga: g.home })),
  }));
  return { lines, titles: titles?.n ?? 0, tourAwards: awards?.n ?? 0, refereed: refs?.n ?? 0, peakRating: peak?.peak ?? null };
}

export type PlayerAchievement = AchievementState & { unlocked_at: Date | null };

export async function playerAchievements(userId: string): Promise<PlayerAchievement[]> {
  const [facts, got] = await Promise.all([
    achievementFacts(userId),
    q<{ key: string; unlocked_at: Date }>("select key, unlocked_at from user_achievements where user_id = $1", [userId]),
  ]);
  const at = new Map(got.map((g) => [g.key, g.unlocked_at]));
  // Once earned, it stays earned (even if a result is later corrected).
  return evaluate(facts).map((s) => ({ ...s, done: s.done || at.has(s.def.key), unlocked_at: at.get(s.def.key) ?? null }));
}

/** Players who already had history before achievements existed get theirs silently, once. */
async function ensureBackfill(c?: Queryable) {
  const done = await one("select 1 from settings where key = 'achievements_backfill'", [], c);
  if (done) return;
  const users = await q<{ id: string }>("select id from users", [], c);
  for (const u of users) await unlock(u.id, c, false);
  await q("insert into settings (key, value) values ('achievements_backfill', 'done') on conflict (key) do nothing", [], c);
}

async function unlock(userId: string, c: Queryable | undefined, announce: boolean) {
  const states = evaluate(await achievementFacts(userId, c)).filter((s) => s.done);
  if (!states.length) return [];
  const fresh = await q<{ key: string }>(
    `insert into user_achievements (user_id, key) select $1, k from unnest($2::text[]) as k
     on conflict do nothing returning key`,
    [userId, states.map((s) => s.def.key)],
    c,
  );
  if (!announce || !fresh.length) return fresh;
  const nick = (await one<{ rl_nickname: string }>("select rl_nickname from users where id = $1", [userId], c))?.rl_nickname ?? "?";
  for (const { key } of fresh) {
    const def = ACHIEVEMENTS.find((a) => a.key === key)!;
    await notify(c, [userId], "🏅 Новое достижение: {icon} {name}", def.desc, `/players/${userId}#achievements`, { icon: def.icon, name: def.name, n: def.target });
    await enqueueChannel(c, "results", {
      title: "🏅 {nick}: {icon} {name}",
      description: def.desc,
      params: { nick, icon: def.icon, name: def.name, n: def.target },
      link: `/players/${userId}#achievements`,
      color: 0xd9ad50,
    });
  }
  return fresh;
}

/** Checks the given players for newly earned achievements and announces them. Never throws. */
export async function checkAchievements(c: Queryable | undefined, userIds: (string | null | undefined)[]) {
  // A savepoint keeps a failure here from aborting the caller's transaction (the match result).
  if (c) await q("savepoint achievements", [], c);
  try {
    await ensureBackfill(c);
    for (const id of new Set(userIds.filter(Boolean) as string[])) await unlock(id, c, true);
    if (c) await q("release savepoint achievements", [], c);
  } catch (e) {
    console.error("[achievements]", e);
    if (c) await q("rollback to savepoint achievements", [], c).catch(() => {});
  }
}

export async function matchPeople(c: Queryable | undefined, matchId: string) {
  return (
    await q<{ user_id: string }>(
      `select em.user_id from matches m join entry_members em on em.entry_id in (m.home_entry_id, m.away_entry_id) and em.active where m.id = $1
       union select referee_user_id from matches where id = $1 and referee_user_id is not null`,
      [matchId],
      c,
    )
  ).map((r) => r.user_id);
}
