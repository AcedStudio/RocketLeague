import "server-only";
import { q, one, tx, type Queryable } from "./db";
import { FormError } from "./errors";
import { notify } from "./notify";
import { entryRatings } from "./rating";
import { winChance } from "./engine/odds.ts";
import { matchRewards } from "./engine/bets.ts";

type BetMatch = {
  id: string; competition_id: string; status: string; is_bye: boolean; scheduled_at: Date | null;
  home_entry_id: string | null; away_entry_id: string | null; winner_entry_id: string | null; referee_user_id: string | null;
};

const MATCH_FIELDS = "id, competition_id, status, is_bye, scheduled_at, home_entry_id, away_entry_id, winner_entry_id, referee_user_id";

/** Coin rewards for a correct call on each side, from the current ratings. */
export async function oddsOf(m: Pick<BetMatch, "competition_id" | "home_entry_id" | "away_entry_id">, c?: Queryable) {
  const ratings = await entryRatings(m.competition_id, c);
  const h = ratings.find((r) => r.entry_id === m.home_entry_id)?.rating ?? 1000;
  const a = ratings.find((r) => r.entry_id === m.away_entry_id)?.rating ?? 1000;
  return matchRewards(winChance(h, a));
}

/** Why a player can't predict this match (or null if they can). */
async function closedReason(m: BetMatch, userId: string, c?: Queryable) {
  if (m.is_bye || !m.home_entry_id || !m.away_entry_id) return "На этот матч прогнозы не принимаются";
  if (["completed", "under_review"].includes(m.status)) return "Прогнозы на этот матч закрыты";
  if (m.scheduled_at && new Date(m.scheduled_at).getTime() <= Date.now()) return "Матч уже начался — прогнозы закрыты";
  const reported = await one("select 1 from match_reports where match_id = $1 and status = 'pending'", [m.id], c);
  if (reported) return "Прогнозы на этот матч закрыты";
  if (m.referee_user_id === userId) return "Судья матча не может делать прогноз";
  const plays = await one("select 1 from entry_members where entry_id = any($1::uuid[]) and user_id = $2 and active", [[m.home_entry_id, m.away_entry_id], userId], c);
  if (plays) return "На свой матч прогноз сделать нельзя";
  return null;
}

/** A free call on who wins. The reward for a correct call is fixed at the moment of the call. */
export async function placeBet(userId: string, matchId: string, pick: "home" | "away") {
  return tx(async (c) => {
    const m = await one<BetMatch>(`select ${MATCH_FIELDS} from matches where id = $1`, [matchId], c);
    if (!m) throw new FormError("Матч не найден");
    const why = await closedReason(m, userId, c);
    if (why) throw new FormError(why);
    if (await one("select 1 from bets where user_id = $1 and match_id = $2", [userId, matchId], c)) throw new FormError("Вы уже сделали прогноз на этот матч");
    const reward = (await oddsOf(m, c))[pick];
    await q("insert into bets (user_id, match_id, pick, stake, odds) values ($1, $2, $3, 0, $4)", [userId, matchId, pick, reward], c);
    return { reward };
  });
}

/** Pays out (or re-pays after a correction) every prediction on a completed match. Idempotent. */
export async function settleBets(c: Queryable, matchId: string) {
  const m = await one<BetMatch>(`select ${MATCH_FIELDS} from matches where id = $1`, [matchId], c);
  if (!m || m.status !== "completed" || !m.winner_entry_id) return 0;
  const bets = await q<{ id: string; user_id: string; pick: "home" | "away"; stake: number; odds: string; won: boolean | null }>(
    "select id, user_id, pick, stake, odds, won from bets where match_id = $1",
    [matchId],
    c,
  );
  if (!bets.length) return 0;
  const winnerSide = m.winner_entry_id === m.home_entry_id ? "home" : "away";
  await q("delete from coin_bonuses where reason = 'bet-win' and ref = $1", [matchId], c);
  for (const b of bets) {
    const won = b.pick === winnerSide;
    const paid = won ? Math.round(Number(b.odds)) : 0;
    if (won) await q("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'bet-win', $3)", [b.user_id, paid, matchId], c);
    const changed = b.won !== won;
    await q("update bets set settled_at = now(), won = $2, payout = $3 where id = $1", [b.id, won, paid], c);
    if (changed) {
      await notify(c, [b.user_id], won ? "Прогноз сыграл: +{n} монет" : "Прогноз не сыграл — в следующий раз повезёт", "", `/match/${matchId}`, { n: paid });
    }
  }
  return bets.length;
}

/** Safety net for the cron: settle any open prediction whose match is already completed. */
export async function sweepBets() {
  const open = await q<{ match_id: string }>(
    "select distinct b.match_id from bets b join matches m on m.id = b.match_id where b.settled_at is null and m.status = 'completed' limit 50",
  );
  for (const o of open) await tx((c) => settleBets(c, o.match_id));
  return open.length;
}

export type BetPanel = {
  open: boolean;
  reason: string | null;
  odds: { home: number; away: number };
  pool: { home: number; away: number; people: number };
  mine: { pick: "home" | "away"; reward: number; won: boolean | null; payout: number } | null;
};

export async function betPanel(matchId: string, userId: string | null): Promise<BetPanel | null> {
  const m = await one<BetMatch>(`select ${MATCH_FIELDS} from matches where id = $1`, [matchId]);
  if (!m || m.is_bye || !m.home_entry_id || !m.away_entry_id) return null;
  const [odds, pool, mine, reason] = await Promise.all([
    oddsOf(m),
    one<{ home: number; away: number; people: number }>(
      `select count(*) filter (where pick = 'home')::int as home, count(*) filter (where pick = 'away')::int as away, count(*)::int as people
         from bets where match_id = $1`,
      [matchId],
    ),
    userId ? one<{ pick: "home" | "away"; odds: string; won: boolean | null; payout: number }>("select pick, odds, won, payout from bets where match_id = $1 and user_id = $2", [matchId, userId]) : null,
    userId ? closedReason(m, userId) : Promise.resolve("Войдите, чтобы сделать прогноз"),
  ]);
  return {
    open: !reason && !mine,
    reason,
    odds,
    pool: pool ?? { home: 0, away: 0, people: 0 },
    mine: mine ? { pick: mine.pick, reward: Number(mine.odds), won: mine.won, payout: mine.payout } : null,
  };
}

export async function myBets(userId: string) {
  return q<{ id: string; match_id: string; pick: "home" | "away"; odds: string; won: boolean | null; payout: number; created_at: Date; home: string; away: string; comp: string; status: string }>(
    `select b.id, b.match_id, b.pick, b.odds, b.won, b.payout, b.created_at, he.name as home, ae.name as away, c.name as comp, m.status
       from bets b join matches m on m.id = b.match_id join competitions c on c.id = m.competition_id
       left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
      where b.user_id = $1 order by b.created_at desc limit 50`,
    [userId],
  );
}

export async function topPredictors(limit = 10) {
  return q<{ user_id: string; nick: string; avatar: string | null; name_color: string | null; bets: number; wins: number; profit: number }>(
    `select u.id as user_id, u.rl_nickname as nick, u.avatar, u.name_color, count(*)::int as bets, count(*) filter (where b.won)::int as wins,
            sum(b.payout)::int as profit
       from bets b join users u on u.id = b.user_id where b.settled_at is not null
      group by u.id having count(*) >= 1 order by count(*) filter (where b.won) desc, sum(b.payout) desc limit $1`,
    [limit],
  );
}

/** Rewards for a set of upcoming matches at once. */
export async function oddsForMatches(ms: BetMatch[]) {
  const byComp = new Map<string, Awaited<ReturnType<typeof entryRatings>>>();
  const out = new Map<string, { home: number; away: number }>();
  for (const m of ms) {
    if (!m.home_entry_id || !m.away_entry_id) continue;
    if (!byComp.has(m.competition_id)) byComp.set(m.competition_id, await entryRatings(m.competition_id));
    const r = byComp.get(m.competition_id)!;
    const h = r.find((x) => x.entry_id === m.home_entry_id)?.rating ?? 1000;
    const a = r.find((x) => x.entry_id === m.away_entry_id)?.rating ?? 1000;
    out.set(m.id, matchRewards(winChance(h, a)));
  }
  return out;
}
