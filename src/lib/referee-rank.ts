import "server-only";
import { q, one, tx, type Queryable } from "./db";
import { FormError } from "./errors";
import { notify } from "./notify";
import { payFor, reliability, REF_TRACK } from "./engine/referee";

/** Called inside the result transaction: logs the referee's work and pays them once per match. */
export async function recordRefereeWork(c: Queryable, matchId: string, actorId: string, before: { referee_user_id: string | null; status: string; scheduled_at: Date | null }) {
  if (before.status === "completed") {
    // A later change by someone else is a correction of the referee's result.
    await q("update referee_log set corrected = true where match_id = $1 and referee_id <> $2", [matchId, actorId], c);
    return;
  }
  if (!before.referee_user_id || before.referee_user_id !== actorId) return;
  const minutes = before.scheduled_at ? Math.max(0, Math.round((Date.now() - new Date(before.scheduled_at).getTime()) / 60000)) : null;
  const row = await one("insert into referee_log (match_id, referee_id, minutes) values ($1, $2, $3) on conflict do nothing returning match_id", [matchId, actorId, minutes], c);
  if (!row) return;
  const amount = payFor(minutes);
  await q("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'referee', $3) on conflict do nothing", [actorId, amount, matchId], c);
  await notify(c, [actorId], "Спасибо за судейство! +{n} монет", amount > 10 ? "Быстрый результат — двойная оплата." : "", "/referee", { n: amount });
}

export async function refereeProfile(userId: string) {
  const [logs, overdue, claimed, paid] = await Promise.all([
    q<{ minutes: number | null; corrected: boolean }>("select minutes, corrected from referee_log where referee_id = $1", [userId]),
    one<{ n: number }>(
      `select count(*)::int as n from matches where referee_user_id = $1 and status <> 'completed' and not is_bye
         and scheduled_at < now() - interval '24 hours'`,
      [userId],
    ),
    q<{ ref: string }>("select ref from coin_bonuses where user_id = $1 and reason = 'ref-track'", [userId]),
    one<{ s: number }>("select coalesce(sum(amount), 0)::int as s from coin_bonuses where user_id = $1 and reason = 'referee'", [userId]),
  ]);
  const done = new Set(claimed.map((c) => c.ref));
  const count = logs.length;
  const timed = logs.filter((l) => l.minutes !== null);
  return {
    count,
    overdue: overdue?.n ?? 0,
    score: reliability(logs, overdue?.n ?? 0),
    avgMinutes: timed.length ? Math.round(timed.reduce((s, l) => s + l.minutes!, 0) / timed.length) : null,
    corrections: logs.filter((l) => l.corrected).length,
    earned: paid?.s ?? 0,
    track: REF_TRACK.map((t) => ({ ...t, reached: count >= t.need, claimed: done.has(t.key) })),
  };
}

export async function claimRefTier(userId: string, key: string) {
  const tier = REF_TRACK.find((t) => t.key === key);
  if (!tier) throw new FormError("Такой ступени нет");
  const n = (await one<{ n: number }>("select count(*)::int as n from referee_log where referee_id = $1", [userId]))?.n ?? 0;
  if (n < tier.need) throw new FormError("Нужно отсудить ещё {n} матч(ей)", { n: tier.need - n });
  return tx(async (c) => {
    const row = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'ref-track', $3) on conflict do nothing returning id", [userId, tier.reward.coins, key], c);
    if (!row) throw new FormError("Награда уже получена");
    if (tier.reward.item) await q("insert into purchases (user_id, item, price) values ($1, $2, 0) on conflict do nothing", [userId, tier.reward.item], c);
    return tier;
  });
}

/** Referees of the month, ranked by matches scored, then speed. */
export async function topReferees(limit = 10) {
  return q<{ id: string; rl_nickname: string; avatar: string | null; name_color: string | null; n: number; avg: number | null; fixes: number }>(
    `select u.id, u.rl_nickname, u.avatar, u.name_color, count(*)::int as n, round(avg(l.minutes))::int as avg, count(*) filter (where l.corrected)::int as fixes
       from referee_log l join users u on u.id = l.referee_id
      where l.scored_at > now() - interval '30 days'
      group by u.id order by n desc, avg asc nulls last limit $1`,
    [limit],
  );
}
