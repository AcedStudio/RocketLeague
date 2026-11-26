import "server-only";
import { q, one } from "./db";
import { getCompetition, getStandings, type Competition } from "./data";
import { seasonStory, type SeasonLine, type SeasonStory } from "./engine/wrapped.ts";

export type PlayerSeason = {
  comp: Competition;
  nickname: string;
  story: SeasonStory;
  position: number | null;
  players: number;
  champion: boolean;
  playerOfRound: number;
  teamOfRound: number;
  eloChange: number;
  badges: number;
  finished: boolean;
};

export async function playerSeason(userId: string, competitionId: string): Promise<PlayerSeason | null> {
  const comp = await getCompetition(competitionId);
  if (!comp) return null;
  const entry = await one<{ id: string; nickname: string }>(
    `select e.id, u.rl_nickname as nickname from entries e join entry_members em on em.entry_id = e.id and em.active join users u on u.id = em.user_id
      where e.competition_id = $1 and em.user_id = $2 and e.status = 'confirmed' limit 1`,
    [competitionId, userId],
  );
  if (!entry) return null;
  const rows = await q<{ id: string; round: number; won: boolean; gf: number; ga: number; forfeit: boolean; opp: string; opp_user: string | null }>(
    `select m.id, m.round, m.forfeit, m.winner_entry_id = $2 as won,
            case when m.home_entry_id = $2 then coalesce(m.home_goals, 0) else coalesce(m.away_goals, 0) end as gf,
            case when m.home_entry_id = $2 then coalesce(m.away_goals, 0) else coalesce(m.home_goals, 0) end as ga,
            oe.name as opp,
            (select em.user_id from entry_members em where em.entry_id = oe.id and em.active order by em.is_captain desc limit 1) as opp_user
       from matches m join entries oe on oe.id = case when m.home_entry_id = $2 then m.away_entry_id else m.home_entry_id end
      where m.competition_id = $1 and m.status = 'completed' and not m.is_bye and $2 in (m.home_entry_id, m.away_entry_id)
      order by coalesce(m.completed_at, m.updated_at), m.number`,
    [competitionId, entry.id],
  );
  const lines: SeasonLine[] = rows.map((r) => ({ matchId: r.id, opponent: r.opp, opponentId: r.opp_user, won: r.won, gf: r.gf, ga: r.ga, forfeit: r.forfeit, round: r.round }));
  const [tables, extra] = await Promise.all([
    comp.format === "round_robin" ? getStandings(comp) : Promise.resolve([]),
    one<{ potr: number; totw: number; elo: number; badges: number; first: Date | null }>(
      `select (select count(*)::int from tour_polls where competition_id = $1 and winner_id = $2) as potr,
              (select count(*)::int from tour_team where competition_id = $1 and user_id = $2) as totw,
              (select coalesce(sum(r.delta), 0)::int from rating_changes r join matches m on m.id = r.match_id where m.competition_id = $1 and r.user_id = $2) as elo,
              (select count(*)::int from user_achievements a where a.user_id = $2
                 and a.unlocked_at >= coalesce((select min(m.completed_at) from matches m where m.competition_id = $1 and m.status = 'completed'), now())
                 and a.unlocked_at <= coalesce((select c.finished_at from competitions c where c.id = $1), now())) as badges,
              null as first`,
      [competitionId, userId],
    ),
  ]);
  const rowsAll = tables[0]?.rows ?? [];
  const me = rowsAll.find((r) => r.id === entry.id);
  return {
    comp,
    nickname: entry.nickname,
    story: seasonStory(lines),
    position: me?.position ?? null,
    players: rowsAll.length,
    champion: comp.champion_entry_id === entry.id,
    playerOfRound: extra?.potr ?? 0,
    teamOfRound: extra?.totw ?? 0,
    eloChange: extra?.elo ?? 0,
    badges: extra?.badges ?? 0,
    finished: comp.status === "finished",
  };
}

/** Competitions where the player has at least one result (newest first). */
export async function playerSeasons(userId: string) {
  return q<{ id: string; slug: string; name: string; status: string; played: number }>(
    `select c.id, c.slug, c.name, c.status, count(m.id)::int as played
       from competitions c join entries e on e.competition_id = c.id and e.status = 'confirmed'
       join entry_members em on em.entry_id = e.id and em.active and em.user_id = $1
       join matches m on m.competition_id = c.id and m.status = 'completed' and not m.is_bye and e.id in (m.home_entry_id, m.away_entry_id)
      group by c.id order by max(m.completed_at) desc nulls last`,
    [userId],
  );
}
