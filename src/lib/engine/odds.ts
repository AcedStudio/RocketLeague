// Season odds by simulation: play the remaining matches many times using ELO win chances,
// rebuild the table each time with the real tiebreakers, count who finishes where.
import { expectedScore } from "./elo.ts";
import { computeStandings, type CompletedMatch, type StandingsConfig } from "./standings.ts";
import { createRng } from "./rng.ts";

export type Fixture = { home: string; away: string };
export type Odds = { id: string; title: number; top: number; avgPos: number };

/** Chance that `a` beats `b` (Rocket League has no draws). */
export const winChance = (ratingA: number, ratingB: number) => expectedScore(ratingA, ratingB);

export function simulateSeason(opts: {
  ids: readonly string[];
  played: readonly CompletedMatch[];
  remaining: readonly Fixture[];
  ratings: ReadonlyMap<string, number>;
  cfg: StandingsConfig;
  topN: number;
  runs?: number;
  seed?: number;
}): Odds[] {
  const runs = opts.runs ?? 2000;
  const rng = createRng(opts.seed ?? 20261126);
  const title = new Map(opts.ids.map((id) => [id, 0]));
  const top = new Map(opts.ids.map((id) => [id, 0]));
  const pos = new Map(opts.ids.map((id) => [id, 0]));
  const rating = (id: string) => opts.ratings.get(id) ?? 1000;

  for (let r = 0; r < runs; r++) {
    const sim: CompletedMatch[] = [...opts.played];
    for (const f of opts.remaining) {
      const homeWins = rng() < winChance(rating(f.home), rating(f.away));
      const w = 1 + Math.floor(rng() * 5); // winner's goals 1..5
      const l = Math.floor(rng() * w); // loser scores fewer
      sim.push({ home: f.home, away: f.away, homeGoals: homeWins ? w : l, awayGoals: homeWins ? l : w, winner: homeWins ? f.home : f.away });
    }
    for (const row of computeStandings(opts.ids, sim, opts.cfg)) {
      if (row.position === 1) title.set(row.id, title.get(row.id)! + 1);
      if (row.position <= opts.topN) top.set(row.id, top.get(row.id)! + 1);
      pos.set(row.id, pos.get(row.id)! + row.position);
    }
  }
  return opts.ids
    .map((id) => ({ id, title: title.get(id)! / runs, top: top.get(id)! / runs, avgPos: pos.get(id)! / runs }))
    .sort((a, b) => b.title - a.title || a.avgPos - b.avgPos);
}
