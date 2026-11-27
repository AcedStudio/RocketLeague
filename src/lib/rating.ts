import { rankedUp } from "./engine/ranks.ts";
import { notify } from "./notify";
import type { PoolClient } from "@neondatabase/serverless";
import { q, one, type Queryable } from "./db";
import { rateSeries, marginMultiplier, START_RATING, type EloPlayer } from "./engine/elo.ts";

export type Mode = "1v1" | "2v2";

/** Serialises every rating write: two matches finishing at once must not read the same base. */
async function lockRatings(c: PoolClient) {
  await q("select pg_advisory_xact_lock(hashtext('rl_ratings'))", [], c);
}

export async function currentRatings(userIds: string[], mode: Mode, c?: Queryable): Promise<Map<string, EloPlayer>> {
  const rows = await q<{ user_id: string; rating: number; games: number }>(
    `select u.id as user_id, ${START_RATING} + coalesce(sum(r.delta), 0)::int as rating, count(r.id)::int as games
       from unnest($1::uuid[]) as u(id) left join rating_changes r on r.user_id = u.id and r.mode = $2
      group by u.id`,
    [userIds, mode],
    c,
  );
  return new Map(rows.map((r) => [r.user_id, { id: r.user_id, rating: r.rating, games: r.games }]));
}

/**
 * (Re)rates one match. Old deltas for the match are dropped first, so a corrected
 * result simply replaces the previous one. Forfeits and byes are not rated.
 */
export async function rateMatch(c: PoolClient, matchId: string, locked = false) {
  if (!locked) await lockRatings(c);
  await q("delete from rating_changes where match_id = $1", [matchId], c);
  const m = await one<{
    mode: Mode; status: string; is_bye: boolean; forfeit: boolean; best_of: number;
    home_entry_id: string | null; away_entry_id: string | null; winner_entry_id: string | null;
    home_wins: number | null; away_wins: number | null; home_goals: number | null; away_goals: number | null;
  }>(
    `select c.mode, m.status, m.is_bye, m.forfeit, m.best_of, m.home_entry_id, m.away_entry_id, m.winner_entry_id,
            m.home_wins, m.away_wins, m.home_goals, m.away_goals
       from matches m join competitions c on c.id = m.competition_id where m.id = $1`,
    [matchId],
    c,
  );
  if (!m || m.status !== "completed" || m.is_bye || m.forfeit || !m.home_entry_id || !m.away_entry_id || !m.winner_entry_id) return;

  const members = await q<{ entry_id: string; user_id: string }>(
    "select entry_id, user_id from entry_members where entry_id = any($1::uuid[]) and active",
    [[m.home_entry_id, m.away_entry_id]],
    c,
  );
  const winnerEntry = m.winner_entry_id;
  const loserEntry = winnerEntry === m.home_entry_id ? m.away_entry_id : m.home_entry_id;
  const winIds = members.filter((x) => x.entry_id === winnerEntry).map((x) => x.user_id);
  const loseIds = members.filter((x) => x.entry_id === loserEntry).map((x) => x.user_id);
  if (!winIds.length || !loseIds.length) return;

  const base = await currentRatings([...winIds, ...loseIds], m.mode, c);
  const get = (id: string) => base.get(id) ?? { id, rating: START_RATING, games: 0 };
  const homeWon = winnerEntry === m.home_entry_id;
  const ww = (homeWon ? m.home_wins : m.away_wins) ?? 0;
  const lw = (homeWon ? m.away_wins : m.home_wins) ?? 0;
  const gd = Math.abs((m.home_goals ?? 0) - (m.away_goals ?? 0));
  const deltas = rateSeries(winIds.map(get), loseIds.map(get), marginMultiplier(m.best_of, ww, lw, gd));

  for (const [userId, delta] of deltas) {
    await q(
      `insert into rating_changes (match_id, user_id, mode, entry_id, before, delta) values ($1, $2, $3, $4, $5, $6)`,
      [matchId, userId, m.mode, winIds.includes(userId) ? winnerEntry : loserEntry, get(userId).rating, delta],
      c,
    );
    // A new rank tier (or the first one after placement) is worth a notification. Not during a full replay.
    if (!locked) {
      const up = rankedUp(get(userId).rating, get(userId).rating + delta, get(userId).games);
      if (up) {
        await notify(c, [userId], up.kind === "up" ? "Новый ранг: {tier}" : "Калибровка пройдена: {tier}", "{mode} · {rating} ELO", `/players/${userId}`, {
          tier: up.rank.placed ? up.rank.label : "",
          mode: m.mode,
          rating: get(userId).rating + delta,
        });
      }
    }
  }
}

/** Replays every rated match in the order it was played. Used after big corrections. */
export async function recomputeAll(c: PoolClient): Promise<number> {
  await lockRatings(c);
  await q("delete from rating_changes", [], c);
  const ms = await q<{ id: string }>(
    `select id from matches where status = 'completed' and not is_bye and not forfeit and winner_entry_id is not null
      order by coalesce(completed_at, updated_at), number`,
    [],
    c,
  );
  for (const m of ms) await rateMatch(c, m.id, true);
  return ms.length;
}

export type LeaderRow = { id: string; rl_nickname: string; platform: string; rating: number; games: number; wins: number; last_delta: number | null; equipped_badge?: string | null; name_color?: string | null; avatar?: string | null; club_tag?: string | null };

export async function leaderboard(mode: Mode, search = "", limit = 100): Promise<LeaderRow[]> {
  return q<LeaderRow>(
    `with agg as (
       select r.user_id, ${START_RATING} + sum(r.delta)::int as rating, count(*)::int as games, count(*) filter (where r.delta > 0)::int as wins
         from rating_changes r where r.mode = $1 group by r.user_id)
     select u.id, u.rl_nickname, u.platform, u.equipped_badge, u.name_color, u.avatar, (select c.tag from club_members cm join clubs c on c.id = cm.club_id where cm.user_id = u.id) as club_tag, a.rating, a.games, a.wins,
            (select r.delta from rating_changes r where r.user_id = u.id and r.mode = $1 order by r.created_at desc, r.id desc limit 1) as last_delta
       from agg a join users u on u.id = a.user_id
      where $2 = '' or u.rl_nickname ilike $3
      order by a.rating desc, a.games desc, u.rl_nickname limit $4`,
    [mode, search, `%${search}%`, limit],
  );
}

export type ModeRating = { mode: Mode; rating: number; games: number; peak: number; rank: number | null };

export async function playerRatings(userId: string): Promise<ModeRating[]> {
  const rows = await q<{ mode: Mode; rating: number; games: number; peak: number; rank: number }>(
    `with mine as (
       select mode, delta, sum(delta) over (partition by mode order by created_at, id) as run from rating_changes where user_id = $1),
     agg as (select mode, ${START_RATING} + sum(delta)::int as rating, count(*)::int as games,
                    greatest(${START_RATING}, ${START_RATING} + max(run))::int as peak from mine group by mode),
     everyone as (select mode, user_id, sum(delta) as s from rating_changes group by mode, user_id)
     select a.*, (select count(*)::int + 1 from everyone e where e.mode = a.mode and ${START_RATING} + e.s > a.rating) as rank from agg a`,
    [userId],
  );
  return (["1v1", "2v2"] as Mode[]).map(
    (mode) => rows.find((r) => r.mode === mode) ?? { mode, rating: START_RATING, games: 0, peak: START_RATING, rank: null },
  );
}

/** Points-over-time series for a player's chart (oldest first). */
export async function ratingHistory(userId: string, mode: Mode) {
  return q<{ rating: number; created_at: Date }>(
    `select ${START_RATING} + sum(delta) over (order by created_at, id)::int as rating, created_at
       from rating_changes where user_id = $1 and mode = $2 order by created_at, id`,
    [userId, mode],
  );
}

export async function matchRatingChanges(matchId: string) {
  return q<{ user_id: string; rl_nickname: string; entry_id: string; before: number; delta: number }>(
    `select r.user_id, u.rl_nickname, r.entry_id, r.before, r.delta from rating_changes r join users u on u.id = r.user_id
      where r.match_id = $1 order by r.delta desc, u.rl_nickname`,
    [matchId],
  );
}

/** Average current rating per entry of a competition, for ELO seeding. */
export async function entryRatings(competitionId: string, c?: Queryable) {
  return q<{ entry_id: string; rating: number }>(
    `select e.id as entry_id, round(avg(${START_RATING} + coalesce((select sum(r.delta) from rating_changes r where r.user_id = em.user_id and r.mode = c.mode), 0)))::int as rating
       from entries e join competitions c on c.id = e.competition_id join entry_members em on em.entry_id = e.id and em.active
      where e.competition_id = $1 and e.status = 'confirmed' group by e.id`,
    [competitionId],
    c,
  );
}
