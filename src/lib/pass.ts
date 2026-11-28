import "server-only";
import { EVENTS, overlap } from "./engine/events";
import { q, one, tx } from "./db";
import { FormError } from "./errors";
import { wallet } from "./shop";
import { CRATES, rollCrate, itemId, findItem } from "./engine/shop.ts";
import {
  SEASONS, REWARDS, TIER_XP, EMPTY_ACTIVITY, activityXp, tierOf, currentSeason, seasonStart, seasonEnd, rewardRef,
  dailyQuests, weeklyQuests, questValue, tashkentDay, dayStart, weekOf, addDays, streakOf,
  type Activity, type Season, type Reward, type Quest,
} from "./engine/pass.ts";

type Line = { won: boolean; forfeit: boolean; side: "home" | "away"; games: { home: number; away: number }[] | null };
type DuelLine = { me: number | null; them: number | null; won: boolean };

/** What a player did between two moments: competition matches, refereeing, duels and check-ins. */
export async function activityIn(userId: string, from: Date, to: Date): Promise<Activity> {
  const r = await one<{ lines: Line[] | null; refereed: number; duels: DuelLine[] | null; checkin: number }>(
    `with mine as (select entry_id from entry_members where user_id = $1 and active)
     select
       (select json_agg(json_build_object('won', m.winner_entry_id in (select entry_id from mine), 'forfeit', m.forfeit,
                 'side', case when m.home_entry_id in (select entry_id from mine) then 'home' else 'away' end, 'games', m.games))
          from matches m
         where m.status = 'completed' and not m.is_bye and m.completed_at >= $2 and m.completed_at < $3
           and (m.home_entry_id in (select entry_id from mine) or m.away_entry_id in (select entry_id from mine))) as lines,
       (select count(*)::int from matches where referee_user_id = $1 and status = 'completed' and not forfeit and completed_at >= $2 and completed_at < $3) as refereed,
       (select json_agg(json_build_object('me', case when challenger_id = $1 then ch_goals else op_goals end,
                 'them', case when challenger_id = $1 then op_goals else ch_goals end, 'won', winner_id = $1))
          from duels where status = 'completed' and $1 in (challenger_id, opponent_id) and completed_at >= $2 and completed_at < $3) as duels,
       (select count(*)::int from coin_bonuses where user_id = $1 and reason = 'daily' and created_at >= $2 and created_at < $3) as checkin`,
    [userId, from, to],
  );
  if (!r) return { ...EMPTY_ACTIVITY };
  const lines = r.lines ?? [];
  const duels = r.duels ?? [];
  const mine = (l: Line) => (l.games ?? []).map((g) => (l.side === "home" ? { gf: g.home, ga: g.away } : { gf: g.away, ga: g.home }));
  const real = lines.filter((l) => !l.forfeit);
  return {
    matches: lines.length,
    wins: lines.filter((l) => l.won).length,
    cleanSheets:
      real.filter((l) => l.won && mine(l).length > 0 && mine(l).every((g) => g.ga === 0)).length + duels.filter((d) => d.won && d.them === 0).length,
    goals: real.flatMap(mine).reduce((s, g) => s + g.gf, 0) + duels.reduce((s, d) => s + (d.me ?? 0), 0),
    refereed: r.refereed,
    duels: duels.length,
    duelWins: duels.filter((d) => d.won).length,
    checkin: r.checkin,
  };
}

const eliteId = (s: Season) => `pass:${s.key}:elite`;

export type PassState = {
  fromEvents?: number;
  season: Season;
  xp: number;
  fromActivity: number;
  fromQuests: number;
  tier: number;
  into: number;
  progress: number;
  maxed: boolean;
  elite: boolean;
  claimed: Set<string>;
  rewards: typeof REWARDS[string];
  endsInDays: number;
};

export async function passState(userId: string | null, season = currentSeason() ?? SEASONS[SEASONS.length - 1]): Promise<PassState> {
  const [act, extra] = userId
    ? await Promise.all([
        activityIn(userId, seasonStart(season), seasonEnd(season)),
        one<{ quests: number; elite: boolean; claimed: string[] | null }>(
          `select (select coalesce(sum(amount), 0)::int from pass_xp where user_id = $1 and season = $2) as quests,
                  exists (select 1 from purchases where user_id = $1 and item = $3) as elite,
                  (select array_agg(ref) from coin_bonuses where user_id = $1 and reason = 'pass' and ref like $2 || ':%') as claimed`,
          [userId, season.key, eliteId(season)],
        ),
      ])
    : [EMPTY_ACTIVITY, null];
  // Event boosts: extra XP for activity inside a running/finished event window that overlaps the season.
  let fromEvents = 0;
  if (userId) {
    for (const e of EVENTS) {
      const o = overlap(e, seasonStart(season), seasonEnd(season));
      if (!o || o.from.getTime() > Date.now() || e.boost <= 1) continue;
      fromEvents += Math.round(activityXp(await activityIn(userId, o.from, o.to)) * (e.boost - 1));
    }
  }
  const fromActivity = activityXp(act) + fromEvents;
  const fromQuests = extra?.quests ?? 0;
  const xp = fromActivity + fromQuests;
  return {
    season,
    xp,
    fromActivity,
    fromEvents,
    fromQuests,
    ...tierOf(xp, season),
    elite: !!extra?.elite,
    claimed: new Set(extra?.claimed ?? []),
    rewards: REWARDS[season.key] ?? [],
    endsInDays: Math.max(0, Math.ceil((seasonEnd(season).getTime() - Date.now()) / 86400_000)),
  };
}

/** Gives a tier reward. Coins land in coin_bonuses; items (and crate drops) in purchases at price 0. */
export async function claimTier(userId: string, tierNo: number, track: "free" | "elite"): Promise<Reward & { drop?: string }> {
  const season = currentSeason();
  if (!season) throw new FormError("Сезон ещё не начался или уже закончился");
  const st = await passState(userId, season);
  const row = st.rewards.find((r) => r.tier === tierNo);
  const reward = row?.[track];
  if (!reward) throw new FormError("На этом уровне нет награды");
  if (st.tier < tierNo) throw new FormError("Сначала дойдите до этого уровня");
  if (track === "elite" && !st.elite) throw new FormError("Награды Elite доступны после покупки Elite-пропуска");
  const ref = rewardRef(season.key, tierNo, track);
  return tx(async (c) => {
    await q("select id from users where id = $1 for update", [userId], c);
    const done = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'pass', $3) on conflict do nothing returning id",
      [userId, "coins" in reward ? reward.coins : 0, ref], c);
    if (!done) throw new FormError("Эта награда уже получена");
    if ("item" in reward) {
      await q("insert into purchases (user_id, item, price) values ($1, $2, 0) on conflict do nothing", [userId, reward.item], c);
      return reward;
    }
    if ("crate" in reward) {
      const crate = CRATES.find((x) => x.key === reward.crate)!;
      const owned = new Set((await q<{ item: string }>("select item from purchases where user_id = $1", [userId], c)).map((r) => r.item));
      const drop = rollCrate(crate, owned);
      if (drop) {
        await q("insert into purchases (user_id, item, price) values ($1, $2, 0) on conflict do nothing", [userId, itemId(drop)], c);
        return { ...reward, drop: itemId(drop) };
      }
      // Everything collected: pay the crate's value in coins instead.
      await q("update coin_bonuses set amount = $3 where user_id = $1 and reason = 'pass' and ref = $2", [userId, ref, crate.price], c);
      return { coins: crate.price };
    }
    return reward;
  });
}

export async function buyElite(userId: string) {
  const season = currentSeason();
  if (!season) throw new FormError("Сезон ещё не начался или уже закончился");
  return tx(async (c) => {
    await q("select id from users where id = $1 for update", [userId], c);
    if (await one("select 1 from purchases where user_id = $1 and item = $2", [userId, eliteId(season)], c)) throw new FormError("Elite-пропуск уже ваш");
    const w = await wallet(userId);
    if (w.balance < season.elitePrice) throw new FormError("Не хватает монет: нужно {price}, у вас {have}", { price: season.elitePrice, have: w.balance });
    await q("insert into purchases (user_id, item, price) values ($1, $2, $3)", [userId, eliteId(season), season.elitePrice], c);
  });
}

// ---------------------------------------------------------------- quests
export type QuestState = Quest & { period: "day" | "week"; value: number; done: boolean; claimed: boolean; ref: string };

export async function questsState(userId: string) {
  const day = tashkentDay();
  const week = weekOf(day);
  const [today, thisWeek, claimed] = await Promise.all([
    activityIn(userId, dayStart(day), dayStart(addDays(day, 1))),
    activityIn(userId, dayStart(week), dayStart(addDays(week, 7))),
    q<{ ref: string }>("select ref from pass_xp where user_id = $1 and reason = 'quest' and created_at > now() - interval '9 days'", [userId]),
  ]);
  const got = new Set(claimed.map((r) => r.ref));
  const make = (qs: Quest[], period: "day" | "week", a: Activity, key: string): QuestState[] =>
    qs.map((qq) => {
      const value = questValue(qq, a);
      const ref = `${key}:${qq.key}`;
      return { ...qq, period, value, done: value >= qq.target, claimed: got.has(ref), ref };
    });
  return {
    day,
    week,
    daily: make(dailyQuests(userId, day), "day", today, day),
    weekly: make(weeklyQuests(userId, week), "week", thisWeek, `w${week}`),
  };
}

export async function claimQuest(userId: string, ref: string) {
  const st = await questsState(userId);
  const quest = [...st.daily, ...st.weekly].find((x) => x.ref === ref);
  if (!quest) throw new FormError("Это задание уже не активно");
  if (!quest.done) throw new FormError("Задание ещё не выполнено");
  const season = currentSeason();
  return tx(async (c) => {
    const row = await one("insert into pass_xp (user_id, season, amount, reason, ref) values ($1, $2, $3, 'quest', $4) on conflict do nothing returning id",
      [userId, season?.key ?? "off", quest.xp, ref], c);
    if (!row) throw new FormError("Награда за задание уже получена");
    await q("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'quest', $3) on conflict do nothing", [userId, quest.coins, ref], c);
    return quest;
  });
}

/** Days with a claimed daily bonus (for the streak), most recent first. */
export async function checkinDays(userId: string) {
  const rows = await q<{ ref: string }>("select ref from coin_bonuses where user_id = $1 and reason = 'daily' order by ref desc limit 60", [userId]);
  return new Set(rows.map((r) => r.ref));
}

export async function streakNow(userId: string) {
  return streakOf(await checkinDays(userId), tashkentDay());
}

export { TIER_XP, findItem };
