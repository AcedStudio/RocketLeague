import "server-only";
import { q } from "./db";

export type Rival = {
  opponent: string;
  opponent_user_id: string | null;
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  last_match_id: string;
  last_won: boolean;
  last_score: string | null;
};

/** Everyone a player has faced, with the head-to-head record (most played first). */
export async function playerRivals(userId: string): Promise<Rival[]> {
  return q<Rival>(
    `with mine as (select entry_id from entry_members where user_id = $1 and active),
     games as (
       select m.id, coalesce(m.completed_at, m.updated_at) as at, m.forfeit, m.best_of,
              case when m.home_entry_id in (select entry_id from mine) then m.away_entry_id else m.home_entry_id end as opp_entry,
              m.winner_entry_id in (select entry_id from mine) as won,
              case when m.home_entry_id in (select entry_id from mine) then coalesce(m.home_goals, 0) else coalesce(m.away_goals, 0) end as gf,
              case when m.home_entry_id in (select entry_id from mine) then coalesce(m.away_goals, 0) else coalesce(m.home_goals, 0) end as ga
         from matches m
        where m.status = 'completed' and not m.is_bye
          and (m.home_entry_id in (select entry_id from mine) or m.away_entry_id in (select entry_id from mine))
     ),
     named as (
       select g.*, e.name as opponent,
              (select em.user_id from entry_members em where em.entry_id = g.opp_entry and em.active order by em.is_captain desc, em.joined_at limit 1) as opp_user
         from games g join entries e on e.id = g.opp_entry
     )
     select (array_agg(opponent order by at desc))[1] as opponent,
            opp_user as opponent_user_id,
            count(*)::int as played,
            count(*) filter (where won)::int as wins,
            count(*) filter (where not won)::int as losses,
            sum(case when forfeit then 0 else gf end)::int as gf,
            sum(case when forfeit then 0 else ga end)::int as ga,
            (array_agg(id order by at desc))[1] as last_match_id,
            (array_agg(won order by at desc))[1] as last_won,
            (array_agg(case when forfeit then null else gf || ':' || ga end order by at desc))[1] as last_score
       from named
      group by opp_user
      order by played desc, wins desc, opponent`,
    [userId],
  );
}
