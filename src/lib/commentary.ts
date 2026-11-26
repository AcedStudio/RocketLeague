import "server-only";
import { q, one, type Queryable } from "./db";
import { commentary, seasonRecords, type Line, type SeasonGame } from "./engine/commentary.ts";

/** Completed games of a competition in the order they were played. */
export async function seasonGames(competitionId: string, c?: Queryable): Promise<SeasonGame[]> {
  const rows = await q<{ id: string; winner: string; home: string; away: string; hg: number; ag: number; forfeit: boolean }>(
    `select m.id, m.winner_entry_id as winner, m.home_entry_id as home, m.away_entry_id as away,
            coalesce(m.home_goals, 0) as hg, coalesce(m.away_goals, 0) as ag, m.forfeit
       from matches m
      where m.competition_id = $1 and m.status = 'completed' and not m.is_bye and m.winner_entry_id is not null
      order by coalesce(m.completed_at, m.updated_at), m.number`,
    [competitionId],
    c,
  );
  return rows.map((r) => {
    const homeWon = r.winner === r.home;
    return { matchId: r.id, winner: r.winner, loser: homeWon ? r.away : r.home, wGoals: homeWon ? r.hg : r.ag, lGoals: homeWon ? r.ag : r.hg, forfeit: r.forfeit };
  });
}

/** Headlines for a just-confirmed match (within the result transaction). */
export async function matchCommentary(c: Queryable | undefined, competitionId: string, matchId: string): Promise<Line[]> {
  const games = await seasonGames(competitionId, c);
  const i = games.findIndex((g) => g.matchId === matchId);
  if (i < 0) return [];
  const game = games[i];
  const names = Object.fromEntries(
    (await q<{ id: string; name: string }>("select id, name from entries where competition_id = $1", [competitionId], c)).map((e) => [e.id, e.name]),
  );
  const elo = await one<{ w: number | null; l: number | null }>(
    `select avg(before) filter (where entry_id = $2)::int as w, avg(before) filter (where entry_id = $3)::int as l
       from rating_changes where match_id = $1`,
    [matchId, game.winner, game.loser],
    c,
  );
  return commentary({
    game,
    before: games.slice(0, i),
    names,
    eloBefore: elo?.w != null && elo?.l != null ? { winner: elo.w, loser: elo.l } : undefined,
  });
}

export type CompetitionRecords = {
  biggestWin: { matchId: string; winner: string; loser: string; score: string } | null;
  mostGoals: { matchId: string; winner: string; loser: string; score: string; total: number } | null;
  longestStreak: { name: string; n: number } | null;
  topScorer: { name: string; goals: number } | null;
};

export async function competitionRecords(competitionId: string): Promise<CompetitionRecords> {
  const [games, entries] = await Promise.all([
    seasonGames(competitionId),
    q<{ id: string; name: string }>("select id, name from entries where competition_id = $1", [competitionId]),
  ]);
  const name = (id: string) => entries.find((e) => e.id === id)?.name ?? "?";
  const r = seasonRecords(games);
  const show = (g: SeasonGame | null) => (g ? { matchId: g.matchId, winner: name(g.winner), loser: name(g.loser), score: `${g.wGoals}:${g.lGoals}` } : null);
  return {
    biggestWin: show(r.biggestWin),
    mostGoals: r.mostGoals ? { ...show(r.mostGoals)!, total: r.mostGoals.wGoals + r.mostGoals.lGoals } : null,
    longestStreak: r.longestStreak ? { name: name(r.longestStreak.id), n: r.longestStreak.n } : null,
    topScorer: r.topScorer ? { name: name(r.topScorer.id), goals: r.topScorer.goals } : null,
  };
}
