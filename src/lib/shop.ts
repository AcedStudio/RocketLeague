import "server-only";
import { q, one, tx } from "./db";
import { FormError } from "./errors";
import { logAction } from "./notify";
import { playerLevel } from "./levels";
import { achievementFacts } from "./achievements";
import { TAGS, TITLES, DAILY_BONUS, balance, coinsFromXp, type TitleFacts } from "./engine/shop.ts";

export type Wallet = { balance: number; earned: number; bonuses: number; spent: number; owned: Set<string>; equipped: string | null; dailyClaimed: boolean };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }); // YYYY-MM-DD

export async function wallet(userId: string): Promise<Wallet> {
  const [lvl, extra, owned] = await Promise.all([
    playerLevel(userId),
    one<{ bonuses: number; spent: number; equipped: string | null; daily: boolean }>(
      `select (select coalesce(sum(amount), 0)::int from coin_bonuses where user_id = $1) as bonuses,
              (select coalesce(sum(price), 0)::int from purchases where user_id = $1) as spent,
              (select equipped_badge from users where id = $1) as equipped,
              exists (select 1 from coin_bonuses where user_id = $1 and reason = 'daily' and ref = $2) as daily`,
      [userId, today()],
    ),
    q<{ item: string }>("select item from purchases where user_id = $1", [userId]),
  ]);
  const bonuses = extra?.bonuses ?? 0;
  const spent = extra?.spent ?? 0;
  return {
    balance: balance(lvl.xp, bonuses, spent),
    earned: coinsFromXp(lvl.xp),
    bonuses,
    spent,
    owned: new Set(owned.map((o) => o.item)),
    equipped: extra?.equipped ?? null,
    dailyClaimed: !!extra?.daily,
  };
}

export async function titleFacts(userId: string): Promise<TitleFacts> {
  const [lvl, f, top] = await Promise.all([
    playerLevel(userId),
    achievementFacts(userId),
    one<{ winner: string | null }>(
      `select u.id as winner from duels d join users u on u.id = d.winner_id where d.status = 'completed'
        group by u.id having count(*) >= 3 order by count(*) desc limit 1`,
    ),
  ]);
  let longest = 0;
  let cur = 0;
  for (const l of f.lines) {
    cur = l.won ? cur + 1 : 0;
    longest = Math.max(longest, cur);
  }
  const goals = f.lines.filter((l) => !l.forfeit).flatMap((l) => l.games).reduce((s, g) => s + g.gf, 0);
  return { ...lvl.facts, level: lvl.level, longestStreak: longest, goals, topDuellist: top?.winner === userId };
}

export async function earnedTitles(userId: string) {
  const f = await titleFacts(userId);
  return TITLES.map((t) => ({ ...t, has: t.earned(f) }));
}

export async function claimDaily(userId: string) {
  const row = await one<{ id: number }>(
    "insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'daily', $3) on conflict do nothing returning id",
    [userId, DAILY_BONUS, today()],
  );
  if (!row) throw new FormError("Сегодняшний бонус уже получен — заходите завтра");
}

export async function buyTag(userId: string, key: string) {
  const tag = TAGS.find((t) => t.key === key);
  if (!tag) throw new FormError("Такого тега нет");
  return tx(async (c) => {
    await q("select id from users where id = $1 for update", [userId], c); // one purchase at a time per player
    if (await one("select 1 from purchases where user_id = $1 and item = $2", [userId, `tag:${key}`], c)) throw new FormError("Этот тег уже ваш");
    const w = await wallet(userId);
    if (w.balance < tag.price) throw new FormError("Не хватает монет: нужно {price}, у вас {have}", { price: tag.price, have: w.balance });
    await q("insert into purchases (user_id, item, price) values ($1, $2, $3)", [userId, `tag:${key}`, tag.price], c);
    await q("update users set equipped_badge = $2 where id = $1", [userId, `tag:${key}`], c);
  });
}

export async function equipBadge(userId: string, value: string) {
  if (value === "") {
    await q("update users set equipped_badge = null where id = $1", [userId]);
    return;
  }
  const [kind, key] = value.split(":");
  if (kind === "tag") {
    if (!(await one("select 1 from purchases where user_id = $1 and item = $2", [userId, value]))) throw new FormError("Сначала купите этот тег");
  } else if (kind === "title") {
    const title = TITLES.find((t) => t.key === key);
    if (!title || !title.earned(await titleFacts(userId))) throw new FormError("Этот титул ещё не заработан");
  } else throw new FormError("Такого тега нет");
  await q("update users set equipped_badge = $2 where id = $1", [userId, value]);
}

/** Admin gift: coins for an event, a giveaway, help with refereeing… */
export async function grantCoins(adminId: string, userId: string, amount: number, note: string) {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 5000) throw new FormError("Сумма от 1 до 5000");
  await q("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'gift', $3)", [userId, amount, `${Date.now()}:${note.slice(0, 80)}`]);
  await logAction(undefined, adminId, "coins.grant", `${userId} ${amount} ${note}`);
}
