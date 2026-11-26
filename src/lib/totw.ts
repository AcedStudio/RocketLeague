import "server-only";
import { q, type Queryable } from "./db";
import { teamOfRound, teamSize, type RoundLine } from "./engine/totw.ts";

export type TotwPick = {
  user_id: string;
  nickname: string;
  rank: number;
  score: number;
  match_id: string | null;
  gf: number;
  ga: number;
  elo_delta: number;
};

/** In-Form lasts a week after being picked: the card shows the special design and +3 OVR. */
export const INFORM_DAYS = 7;
export const INFORM_BOOST = 3;

/** Picks and stores the team of a finished round (idempotent). Returns the picks. */
export async function buildTeamOfRound(c: Queryable | undefined, competitionId: string, stage: string, round: number): Promise<TotwPick[]> {
  const rows = await q<{ user_id: string; match_id: string; won: boolean; gf: number; ga: number; forfeit: boolean; delta: number | null }>(
    `select em.user_id, m.id as match_id, m.forfeit,
            m.winner_entry_id = em.entry_id as won,
            case when em.entry_id = m.home_entry_id then coalesce(m.home_goals, 0) else coalesce(m.away_goals, 0) end as gf,
            case when em.entry_id = m.home_entry_id then coalesce(m.away_goals, 0) else coalesce(m.home_goals, 0) end as ga,
            (select r.delta from rating_changes r where r.match_id = m.id and r.user_id = em.user_id) as delta
       from matches m join entry_members em on em.entry_id in (m.home_entry_id, m.away_entry_id) and em.active
      where m.competition_id = $1 and m.stage = $2 and m.round = $3 and m.status = 'completed' and not m.is_bye`,
    [competitionId, stage, round],
    c,
  );
  const players = await q<{ n: number }>(
    "select count(distinct em.user_id)::int as n from entries e join entry_members em on em.entry_id = e.id and em.active where e.competition_id = $1 and e.status = 'confirmed'",
    [competitionId],
    c,
  );
  const lines: (RoundLine & { matchId: string })[] = rows.map((r) => ({ userId: r.user_id, matchId: r.match_id, won: r.won, gf: r.gf, ga: r.ga, forfeit: r.forfeit, eloDelta: r.delta ?? 0 }));
  const picks = teamOfRound(lines, teamSize(players[0]?.n ?? lines.length));
  for (const [i, p] of picks.entries()) {
    const l = lines.find((x) => x.userId === p.userId)!;
    await q(
      `insert into tour_team (competition_id, stage, round, user_id, rank, score, match_id, gf, ga, elo_delta)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict do nothing`,
      [competitionId, stage, round, p.userId, i + 1, p.score, l.matchId, p.gf, p.ga, p.eloDelta],
      c,
    );
  }
  return getTeamOfRound(competitionId, stage, round, c);
}

export async function getTeamOfRound(competitionId: string, stage: string, round: number, c?: Queryable): Promise<TotwPick[]> {
  return q<TotwPick>(
    `select t.user_id, u.rl_nickname as nickname, t.rank, t.score::float as score, t.match_id, t.gf, t.ga, t.elo_delta
       from tour_team t join users u on u.id = t.user_id
      where t.competition_id = $1 and t.stage = $2 and t.round = $3 order by t.rank`,
    [competitionId, stage, round],
    c,
  );
}

export type InFormCard = { competition: string; slug: string; round: number; created_at: Date; gf: number; ga: number; active: boolean };

/** Every In-Form card a player earned, newest first; `active` while within INFORM_DAYS. */
export async function playerInForms(userId: string): Promise<InFormCard[]> {
  return q<InFormCard>(
    `select c.name as competition, c.slug, t.round, t.created_at, t.gf, t.ga, t.created_at > now() - interval '${INFORM_DAYS} days' as active
       from tour_team t join competitions c on c.id = t.competition_id where t.user_id = $1 order by t.created_at desc`,
    [userId],
  );
}

/** Rounds that have a team, newest first (for the competition page). */
export async function teamRounds(competitionId: string) {
  return q<{ stage: string; round: number }>(
    "select distinct stage, round from tour_team where competition_id = $1 order by round desc",
    [competitionId],
  );
}
