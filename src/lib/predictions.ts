import "server-only";
import { q, one, tx } from "./db";
import { FormError } from "./errors";

// Score predictions. Bo1: predict the game's goals; longer series: predict the series score.
// Points: exact score 3 · right winner and margin 2 · right winner 1. Forfeits don't count.
// Locked once the match starts (agreed time reached) or a result exists. The two sides can't predict.

import { POINTS } from "./engine/predict.ts";
export { POINTS, scorePrediction } from "./engine/predict.ts";

/** SQL expression for the actual score the prediction is compared with. */
const ACTUAL_HOME = "case when m.best_of = 1 then m.home_goals else m.home_wins end";
const ACTUAL_AWAY = "case when m.best_of = 1 then m.away_goals else m.away_wins end";
const POINTS_SQL = `case
    when p.home = ${ACTUAL_HOME} and p.away = ${ACTUAL_AWAY} then ${POINTS.exact}
    when sign(p.home - p.away) <> sign(${ACTUAL_HOME} - ${ACTUAL_AWAY}) then 0
    when p.home - p.away = ${ACTUAL_HOME} - ${ACTUAL_AWAY} then ${POINTS.margin}
    else ${POINTS.winner} end`;

export function predictionLocked(m: { status: string; scheduled_at: Date | null }) {
  return ["completed", "under_review", "live"].includes(m.status) || (!!m.scheduled_at && new Date(m.scheduled_at).getTime() <= Date.now());
}

/** Saves several predictions at once: { matchId: [home, away] }. Returns how many were saved. */
export async function savePredictions(userId: string, competitionId: string, picks: Record<string, [number, number]>): Promise<number> {
  return tx(async (c) => {
    let saved = 0;
    for (const [matchId, [home, away]] of Object.entries(picks)) {
      if (![home, away].every((v) => Number.isInteger(v) && v >= 0 && v <= 99)) throw new FormError("Счёт должен быть числом от 0 до 99");
      if (home === away) throw new FormError("В Rocket League не бывает ничьих — выберите победителя");
      const m = await one<{ status: string; scheduled_at: Date | null; best_of: number; home_entry_id: string | null; away_entry_id: string | null; is_bye: boolean }>(
        "select status, scheduled_at, best_of, home_entry_id, away_entry_id, is_bye from matches where id = $1 and competition_id = $2",
        [matchId, competitionId],
        c,
      );
      if (!m || m.is_bye || !m.home_entry_id || !m.away_entry_id) continue;
      if (predictionLocked(m)) continue; // started meanwhile: quietly skip
      if (m.best_of > 1) {
        const need = Math.ceil(m.best_of / 2);
        if (Math.max(home, away) !== need || Math.min(home, away) >= need) throw new FormError("Для серии Bo{bo} укажите счёт серии, например {need}:1", { bo: m.best_of, need });
      }
      const own = await one("select 1 from entry_members where user_id = $1 and active and entry_id = any($2::uuid[])", [userId, [m.home_entry_id, m.away_entry_id]], c);
      if (own) continue;
      await q(
        `insert into predictions (match_id, user_id, home, away) values ($1, $2, $3, $4)
         on conflict (match_id, user_id) do update set home = excluded.home, away = excluded.away, updated_at = now()`,
        [matchId, userId, home, away],
        c,
      );
      saved++;
    }
    return saved;
  });
}

export type PredictorRow = { user_id: string; nickname: string; points: number; exact: number; scored: number; total: number };

export async function predictionTable(competitionId: string): Promise<PredictorRow[]> {
  return q<PredictorRow>(
    `select u.id as user_id, u.rl_nickname as nickname,
            coalesce(sum(case when m.status = 'completed' and not m.forfeit then ${POINTS_SQL} end), 0)::int as points,
            count(*) filter (where m.status = 'completed' and not m.forfeit and p.home = ${ACTUAL_HOME} and p.away = ${ACTUAL_AWAY})::int as exact,
            count(*) filter (where m.status = 'completed' and not m.forfeit)::int as scored,
            count(*)::int as total
       from predictions p join matches m on m.id = p.match_id join users u on u.id = p.user_id
      where m.competition_id = $1
      group by u.id, u.rl_nickname
      order by points desc, exact desc, scored asc, u.rl_nickname`,
    [competitionId],
  );
}

export async function myPredictions(competitionId: string, userId: string) {
  return q<{ match_id: string; home: number; away: number; points: number | null }>(
    `select p.match_id, p.home, p.away,
            case when m.status = 'completed' and not m.forfeit then ${POINTS_SQL} end as points
       from predictions p join matches m on m.id = p.match_id
      where m.competition_id = $1 and p.user_id = $2`,
    [competitionId, userId],
  );
}

/** Community pick for a match: how many backed each side. */
export async function predictionSplit(matchId: string) {
  return (await one<{ home: number; away: number }>(
    "select count(*) filter (where home > away)::int as home, count(*) filter (where away > home)::int as away from predictions where match_id = $1",
    [matchId],
  )) ?? { home: 0, away: 0 };
}
