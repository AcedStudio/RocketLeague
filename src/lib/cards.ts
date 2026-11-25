import "server-only";
import { q, one } from "./db";
import { computeCard, type CardStats, type MatchLine } from "./engine/card.ts";
import { tierOf, START_RATING, type Tier } from "./engine/elo.ts";
import { playerRatings, type ModeRating } from "./rating";

export const CALIBRATION = 5;

export type PlayerCard = {
  id: string;
  nickname: string;
  platform: string;
  mode: "1v1" | "2v2";
  rating: number;
  ratedGames: number;
  tier: Tier | null; // null while calibrating
  stats: CardStats;
  titles: number;
  tourAwards: number;
  reigning: string[];
  ratings: ModeRating[];
};

type Row = { side: "home" | "away"; won: boolean; forfeit: boolean; games: { home: number; away: number }[] | null };

export async function getPlayerCard(userId: string): Promise<PlayerCard | null> {
  const u = await one<{ id: string; rl_nickname: string; platform: string }>("select id, rl_nickname, platform from users where id = $1", [userId]);
  if (!u) return null;
  const [rows, ratings, titles, awards] = await Promise.all([
    q<Row>(
      `with mine as (select entry_id from entry_members where user_id = $1 and active)
       select case when m.home_entry_id in (select entry_id from mine) then 'home' else 'away' end as side,
              m.winner_entry_id in (select entry_id from mine) as won, m.forfeit, m.games
         from matches m
        where m.status = 'completed' and not m.is_bye
          and (m.home_entry_id in (select entry_id from mine) or m.away_entry_id in (select entry_id from mine))
        order by coalesce(m.completed_at, m.updated_at), m.number`,
      [userId],
    ),
    playerRatings(userId),
    q<{ mode: string; reigning: boolean }>(
      `select c.mode, c.id = (select c2.id from competitions c2 where c2.mode = c.mode and c2.status = 'finished' and c2.champion_entry_id is not null
                              order by c2.finished_at desc nulls last limit 1) as reigning
         from competitions c join entry_members em on em.entry_id = c.champion_entry_id and em.active
        where c.status = 'finished' and em.user_id = $1`,
      [userId],
    ),
    one<{ n: number }>("select count(*)::int as n from tour_polls where winner_id = $1", [userId]),
  ]);
  const lines: MatchLine[] = rows.map((r) => ({
    won: r.won,
    forfeit: r.forfeit,
    games: (r.games ?? []).map((g) => (r.side === "home" ? { gf: g.home, ga: g.away } : { gf: g.away, ga: g.home })),
  }));
  // The card shows the mode the player is best known for: more rated games, then higher rating.
  const main = [...ratings].sort((a, b) => b.games - a.games || b.rating - a.rating)[0];
  const calibrated = main.games >= CALIBRATION;
  return {
    id: u.id,
    nickname: u.rl_nickname,
    platform: u.platform,
    mode: main.mode,
    rating: main.games ? main.rating : START_RATING,
    ratedGames: main.games,
    tier: calibrated ? tierOf(main.rating) : null,
    stats: computeCard(lines, main.games ? main.rating : null),
    titles: titles.length,
    tourAwards: awards?.n ?? 0,
    reigning: titles.filter((x) => x.reigning).map((x) => x.mode),
    ratings,
  };
}
