import "server-only";
import { q, one, tx, type Queryable } from "./db";
import { FormError } from "./errors";
import { notify } from "./notify";
import { enqueueChannel } from "./discord";

// Friendly challenges between two players. Flow: pending → accepted → reported → completed.
// The player who did not report confirms; a pending challenge expires after 3 days,
// an accepted one after 7 days without a score, a reported score auto-confirms after 24 hours.

export const PENDING_HOURS = 72;
export const PLAY_DAYS = 7;
export const CONFIRM_HOURS = 24;
export const MAX_OUTGOING = 3;

export type Duel = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenger: string;
  opponent: string;
  message: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired" | "reported" | "completed";
  created_at: Date;
  responded_at: Date | null;
  reported_by: string | null;
  ch_goals: number | null;
  op_goals: number | null;
  winner_id: string | null;
  completed_at: Date | null;
};

const SELECT = `select d.*, cu.rl_nickname as challenger, ou.rl_nickname as opponent
  from duels d join users cu on cu.id = d.challenger_id join users ou on ou.id = d.opponent_id`;

async function lockDuel(c: Queryable, id: string) {
  const d = await one<Duel>(`${SELECT} where d.id = $1 for update of d`, [id], c);
  if (!d) throw new FormError("Дуэль не найдена");
  return d;
}

export async function createDuel(challengerId: string, opponentId: string, message: string) {
  if (challengerId === opponentId) throw new FormError("Нельзя вызвать на дуэль самого себя");
  return tx(async (c) => {
    const opp = await one<{ rl_nickname: string }>("select rl_nickname from users where id = $1", [opponentId], c);
    if (!opp) throw new FormError("Игрок не найден");
    const open = await one<{ n: number }>("select count(*)::int as n from duels where challenger_id = $1 and status = 'pending'", [challengerId], c);
    if ((open?.n ?? 0) >= MAX_OUTGOING) throw new FormError("У вас уже {n} вызова без ответа — дождитесь ответа", { n: MAX_OUTGOING });
    const pair = await one(
      `select 1 from duels where status in ('pending', 'accepted', 'reported')
         and ((challenger_id = $1 and opponent_id = $2) or (challenger_id = $2 and opponent_id = $1))`,
      [challengerId, opponentId],
      c,
    );
    if (pair) throw new FormError("С этим игроком у вас уже есть незавершённая дуэль");
    const d = await one<{ id: string }>(
      "insert into duels (challenger_id, opponent_id, message) values ($1, $2, $3) returning id",
      [challengerId, opponentId, message.trim().slice(0, 200)],
      c,
    );
    const me = await one<{ rl_nickname: string }>("select rl_nickname from users where id = $1", [challengerId], c);
    await notify(c, [opponentId], "⚔️ {name} вызывает вас на дуэль!", message ? "«{msg}»" : "Ответьте в течение 3 дней", "/duels", { name: me?.rl_nickname ?? "", msg: message.slice(0, 120) });
    return d!.id;
  });
}

export async function respondDuel(id: string, userId: string, accept: boolean) {
  return tx(async (c) => {
    const d = await lockDuel(c, id);
    if (d.opponent_id !== userId) throw new FormError("Ответить на вызов может только тот, кого вызвали");
    if (d.status !== "pending") throw new FormError("На этот вызов уже ответили");
    await q("update duels set status = $2, responded_at = now() where id = $1", [id, accept ? "accepted" : "declined"], c);
    await notify(c, [d.challenger_id], accept ? "⚔️ {name} принял вызов! Договоритесь о времени" : "{name} отклонил вызов", "", "/duels", { name: d.opponent });
  });
}

export async function cancelDuel(id: string, userId: string) {
  return tx(async (c) => {
    const d = await lockDuel(c, id);
    if (d.challenger_id !== userId) throw new FormError("Отменить вызов может только тот, кто его отправил");
    if (d.status !== "pending") throw new FormError("Вызов уже нельзя отменить");
    await q("update duels set status = 'cancelled', responded_at = now() where id = $1", [id], c);
  });
}

/** Either player reports the score of the single game (goals, no draws). */
export async function reportDuel(id: string, userId: string, myGoals: number, theirGoals: number) {
  if (![myGoals, theirGoals].every((g) => Number.isInteger(g) && g >= 0 && g <= 99)) throw new FormError("Счёт должен быть числом от 0 до 99");
  if (myGoals === theirGoals) throw new FormError("В Rocket League не бывает ничьих — укажите счёт после овертайма");
  return tx(async (c) => {
    const d = await lockDuel(c, id);
    const mine = d.challenger_id === userId ? "ch" : d.opponent_id === userId ? "op" : null;
    if (!mine) throw new FormError("Счёт могут внести только участники дуэли");
    if (d.status !== "accepted") throw new FormError("Счёт можно внести только после принятия вызова");
    const [ch, op] = mine === "ch" ? [myGoals, theirGoals] : [theirGoals, myGoals];
    await q("update duels set status = 'reported', reported_by = $2, reported_at = now(), ch_goals = $3, op_goals = $4 where id = $1", [id, userId, ch, op], c);
    const other = mine === "ch" ? d.opponent_id : d.challenger_id;
    const who = mine === "ch" ? d.challenger : d.opponent;
    await notify(c, [other], "⚔️ {name} внёс счёт дуэли {score} — подтвердите", "Если не ответить за 24 часа, счёт подтвердится сам", "/duels", { name: who, score: `${ch}:${op}` });
  });
}

/** The other player confirms (or rejects, sending the duel back to "accepted"). */
export async function confirmDuel(id: string, userId: string, agree: boolean) {
  return tx(async (c) => {
    const d = await lockDuel(c, id);
    if (d.status !== "reported") throw new FormError("Нечего подтверждать");
    if (userId === d.reported_by || (userId !== d.challenger_id && userId !== d.opponent_id)) throw new FormError("Подтвердить счёт должен соперник");
    if (!agree) {
      await q("update duels set status = 'accepted', reported_by = null, reported_at = null, ch_goals = null, op_goals = null where id = $1", [id], c);
      await notify(c, [d.reported_by!], "Соперник не согласен со счётом дуэли — внесите счёт заново", "", "/duels");
      return;
    }
    await finish(c, d);
  });
}

async function finish(c: Queryable, d: Duel) {
  const winner = (d.ch_goals ?? 0) > (d.op_goals ?? 0) ? d.challenger_id : d.opponent_id;
  await q("update duels set status = 'completed', winner_id = $2, completed_at = now() where id = $1", [d.id, winner], c);
  const score = `${d.ch_goals}:${d.op_goals}`;
  await notify(c, [d.challenger_id, d.opponent_id], "⚔️ Дуэль завершена: {a} {score} {b}", "", "/duels", { a: d.challenger, b: d.opponent, score });
  await enqueueChannel(c, "results", { title: "⚔️ {a} {score} {b}", description: "Дуэль", params: { a: d.challenger, b: d.opponent, score }, link: "/duels", color: 0xd9ad50 });
}

/** Clock work for the sweep: expire stale challenges, auto-confirm old reports. */
export async function sweepDuels() {
  await q(
    `update duels set status = 'expired' where (status = 'pending' and created_at < now() - interval '${PENDING_HOURS} hours')
        or (status = 'accepted' and responded_at < now() - interval '${PLAY_DAYS} days')`,
  );
  const due = await q<{ id: string }>(`select id from duels where status = 'reported' and reported_at < now() - interval '${CONFIRM_HOURS} hours' limit 20`);
  for (const { id } of due) {
    await tx(async (c) => {
      const d = await lockDuel(c, id);
      if (d.status === "reported") await finish(c, d);
    });
  }
}

export async function myDuels(userId: string) {
  return q<Duel>(`${SELECT} where d.challenger_id = $1 or d.opponent_id = $1 order by d.created_at desc limit 50`, [userId]);
}

export async function recentDuels(limit = 12) {
  return q<Duel>(`${SELECT} where d.status = 'completed' order by d.completed_at desc limit $1`, [limit]);
}

export type DuelRow = { user_id: string; nickname: string; badge: string | null; color: string | null; avatar: string | null; played: number; wins: number; losses: number };

export async function duelTable(limit = 20) {
  return q<DuelRow>(
    `select u.id as user_id, u.rl_nickname as nickname, u.equipped_badge as badge, u.name_color as color, u.avatar, count(*)::int as played,
            count(*) filter (where d.winner_id = u.id)::int as wins,
            count(*) filter (where d.winner_id <> u.id)::int as losses
       from duels d join users u on u.id in (d.challenger_id, d.opponent_id)
      where d.status = 'completed'
      group by u.id, u.rl_nickname, u.equipped_badge, u.name_color, u.avatar
      order by wins desc, losses asc, u.rl_nickname limit $1`,
    [limit],
  );
}

export async function duelRecord(userId: string) {
  return (
    (await one<{ played: number; wins: number }>(
      "select count(*)::int as played, count(*) filter (where winner_id = $1)::int as wins from duels where status = 'completed' and $1 in (challenger_id, opponent_id)",
      [userId],
    )) ?? { played: 0, wins: 0 }
  );
}
