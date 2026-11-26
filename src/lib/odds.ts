import "server-only";
import { q, one } from "./db";
import { getGroups, getPrizes, type Competition, type Match } from "./data";
import { entryRatings } from "./rating";
import { simulateSeason, type Odds } from "./engine/odds.ts";

export type LeagueOdds = { odds: Map<string, Odds>; topN: number; afterRound: number | null };

/** Title / prize-zone chances for a single-table league. Cached per number of played matches. */
export async function leagueOdds(comp: Competition): Promise<LeagueOdds | null> {
  if (comp.format !== "round_robin" || comp.draw_state !== "published") return null;
  const [groups, matches, ratings, prizes] = await Promise.all([
    getGroups(comp.id),
    q<Match>("select * from matches where competition_id = $1 and stage = 'league' and not is_bye and home_entry_id is not null and away_entry_id is not null", [comp.id]),
    entryRatings(comp.id),
    getPrizes(comp.id),
  ]);
  const ids = groups[0]?.entry_ids ?? [];
  if (ids.length < 2) return null;
  const done = matches.filter((m) => m.status === "completed" && m.winner_entry_id);
  const topN = Math.max(1, ...prizes.map((p) => p.place ?? 0));
  const afterRound = done.length ? Math.max(...done.map((m) => m.round)) : null;

  // Same inputs → same answer: reuse the last run until a result changes.
  const key = `odds:${comp.id}`;
  const stamp = `${done.length}:${done.reduce((s, m) => s + new Date(m.completed_at ?? 0).getTime() + (m.home_goals ?? 0) * 7 + (m.away_goals ?? 0), 0)}`;
  const cached = await one<{ value: string }>("select value from settings where key = $1", [key]);
  if (cached) {
    const c = JSON.parse(cached.value) as { stamp: string; odds: Odds[] };
    if (c.stamp === stamp) return { odds: new Map(c.odds.map((o) => [o.id, o])), topN, afterRound };
  }
  const odds = simulateSeason({
    ids,
    played: done.map((m) => ({ home: m.home_entry_id!, away: m.away_entry_id!, homeGoals: m.home_goals ?? 0, awayGoals: m.away_goals ?? 0, winner: m.winner_entry_id! })),
    remaining: matches.filter((m) => m.status !== "completed").map((m) => ({ home: m.home_entry_id!, away: m.away_entry_id! })),
    ratings: new Map(ratings.map((r) => [r.entry_id, r.rating])),
    cfg: { pointsWin: comp.points_win, pointsLoss: comp.points_loss, tiebreakers: comp.tiebreakers },
    topN,
  });
  await q(
    "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
    [key, JSON.stringify({ stamp, odds })],
  );
  return { odds: new Map(odds.map((o) => [o.id, o])), topN, afterRound };
}
