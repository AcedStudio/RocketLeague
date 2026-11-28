import "server-only";
import { q, one } from "./db";
import { proStats, activityGrid, type Result } from "./engine/prostats";
import { leagueOdds } from "./odds";
import { getCompetition } from "./data";
import { playerRatings } from "./rating";

const TZ = "Asia/Tashkent";

/** Official results from the player's side (oldest first); goals counted over the series. */
export async function playerResults(userId: string): Promise<(Result & { matchId: string; mode: string; delta: number })[]> {
  const rows = await q<{ match_id: string; mode: string; delta: number; won: boolean; gf: number | null; ga: number | null; at: Date }>(
    `select r.match_id, r.mode, r.delta, m.winner_entry_id = r.entry_id as won,
            case when m.home_entry_id = r.entry_id then m.home_goals else m.away_goals end as gf,
            case when m.home_entry_id = r.entry_id then m.away_goals else m.home_goals end as ga,
            coalesce(m.completed_at, r.created_at) as at
       from rating_changes r join matches m on m.id = r.match_id
      where r.user_id = $1 and m.status = 'completed' and m.winner_entry_id is not null
      order by coalesce(m.completed_at, r.created_at), r.id`,
    [userId],
  );
  return rows.map((r) => ({ matchId: r.match_id, mode: r.mode, delta: r.delta, won: !!r.won, gf: r.gf ?? 0, ga: r.ga ?? 0, at: new Date(r.at) }));
}

async function duelDates(userId: string) {
  return (
    await q<{ at: Date }>("select completed_at as at from duels where status = 'completed' and completed_at is not null and $1 in (challenger_id, opponent_id)", [userId])
  ).map((r) => new Date(r.at));
}

/** Title chances in leagues the player is currently in. */
export async function titleChances(userId: string) {
  const rows = await q<{ competition_id: string; entry_id: string }>(
    `select c.id as competition_id, em.entry_id from entry_members em
       join entries e on e.id = em.entry_id and e.status = 'confirmed'
       join competitions c on c.id = em.competition_id
      where em.user_id = $1 and em.active and c.format = 'round_robin' and c.draw_state = 'published' and c.status in ('in_progress', 'playoffs')`,
    [userId],
  );
  const out: { slug: string; name: string; title: number; top: number; topN: number; avgPos: number }[] = [];
  for (const r of rows) {
    const comp = await getCompetition(r.competition_id);
    if (!comp) continue;
    const odds = await leagueOdds(comp).catch(() => null);
    const o = odds?.odds.get(r.entry_id);
    if (o) out.push({ slug: comp.slug, name: comp.name, title: o.title, top: o.top, topN: odds!.topN, avgPos: o.avgPos });
  }
  return out;
}

export async function proProfile(userId: string, now = new Date()) {
  const [results, duels] = await Promise.all([playerResults(userId), duelDates(userId)]);
  return {
    stats: proStats(results),
    activity: activityGrid([...results.map((r) => r.at), ...duels], now, TZ),
    biggestWin: results.filter((r) => r.won).sort((a, b) => b.gf - b.ga - (a.gf - a.ga))[0] ?? null,
  };
}

/** Head-to-head between two players: official matches on opposite sides + completed duels. */
export async function headToHead(a: string, b: string) {
  const matches = await q<{ id: string; a_won: boolean; a_goals: number | null; b_goals: number | null; at: Date; comp: string }>(
    `select m.id, m.winner_entry_id = ra.entry_id as a_won,
            case when m.home_entry_id = ra.entry_id then m.home_goals else m.away_goals end as a_goals,
            case when m.home_entry_id = ra.entry_id then m.away_goals else m.home_goals end as b_goals,
            coalesce(m.completed_at, m.updated_at) as at, c.name as comp
       from rating_changes ra
       join rating_changes rb on rb.match_id = ra.match_id and rb.user_id = $2 and rb.entry_id <> ra.entry_id
       join matches m on m.id = ra.match_id
       join competitions c on c.id = m.competition_id
      where ra.user_id = $1 and m.status = 'completed' and m.winner_entry_id is not null
      order by at desc`,
    [a, b],
  );
  const duels = await q<{ id: string; a_won: boolean; a_goals: number; b_goals: number; at: Date }>(
    `select id, winner_id = $1 as a_won,
            case when challenger_id = $1 then ch_goals else op_goals end as a_goals,
            case when challenger_id = $1 then op_goals else ch_goals end as b_goals,
            completed_at as at
       from duels where status = 'completed' and winner_id is not null
        and ((challenger_id = $1 and opponent_id = $2) or (challenger_id = $2 and opponent_id = $1))
      order by completed_at desc`,
    [a, b],
  );
  const all = [...matches.map((m) => ({ ...m, kind: "match" as const })), ...duels.map((d) => ({ ...d, comp: "", kind: "duel" as const }))].sort(
    (x, y) => new Date(y.at).getTime() - new Date(x.at).getTime(),
  );
  return {
    aWins: all.filter((x) => x.a_won).length,
    bWins: all.filter((x) => !x.a_won).length,
    aGoals: all.reduce((s, x) => s + (x.a_goals ?? 0), 0),
    bGoals: all.reduce((s, x) => s + (x.b_goals ?? 0), 0),
    list: all.slice(0, 10),
  };
}

export async function compareCard(userId: string) {
  const [user, ratings, pro] = await Promise.all([
    one<{ id: string; rl_nickname: string; platform: string; avatar: string | null; name_color: string | null; equipped_badge: string | null }>(
      "select id, rl_nickname, platform, avatar, name_color, equipped_badge from users where id = $1",
      [userId],
    ),
    playerRatings(userId),
    proProfile(userId),
  ]);
  return user ? { user, ratings, ...pro } : null;
}

/** Accepts an id or a nickname. */
export async function findPlayer(v: string | undefined) {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  const isUuid = /^[0-9a-f-]{36}$/i.test(s);
  return (await one<{ id: string }>(isUuid ? "select id from users where id = $1" : "select id from users where lower(rl_nickname) = lower($1)", [s]))?.id ?? null;
}
