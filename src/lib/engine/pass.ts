// Season Pass and quests: pure rules (no database). Pass XP comes from activity inside the season
// window plus quest rewards; tiers unlock rewards on a free track and an Elite track (bought with coins).

export type Season = { key: string; name: string; tagline: string; start: string; end: string; tiers: number; elitePrice: number };

/** Dates are Tashkent calendar days; a season runs from the start of `start` to the end of `end`. */
export const SEASONS: Season[] = [
  { key: "s1", name: "Season 1", tagline: "Ignition", start: "2026-11-27", end: "2027-01-31", tiers: 30, elitePrice: 1000 },
];

export const TIER_XP = 200;
const TZ_OFFSET = 5 * 3600_000; // Asia/Tashkent, no DST

export const seasonStart = (s: Season) => new Date(Date.parse(`${s.start}T00:00:00Z`) - TZ_OFFSET);
export const seasonEnd = (s: Season) => new Date(Date.parse(`${s.end}T00:00:00Z`) - TZ_OFFSET + 86400_000);
export function currentSeason(now = new Date()): Season | null {
  return SEASONS.find((s) => now >= seasonStart(s) && now < seasonEnd(s)) ?? null;
}

/** Activity inside a time window. */
export type Activity = {
  matches: number;
  wins: number;
  cleanSheets: number;
  goals: number;
  refereed: number;
  duels: number;
  duelWins: number;
  checkin: number;
};
export const EMPTY_ACTIVITY: Activity = { matches: 0, wins: 0, cleanSheets: 0, goals: 0, refereed: 0, duels: 0, duelWins: 0, checkin: 0 };

export const PASS_XP = { match: 40, win: 30, cleanSheet: 20, goal: 3, refereed: 50, duel: 20, duelWin: 15 };

export function activityXp(a: Activity) {
  return (
    a.matches * PASS_XP.match +
    a.wins * PASS_XP.win +
    a.cleanSheets * PASS_XP.cleanSheet +
    a.goals * PASS_XP.goal +
    a.refereed * PASS_XP.refereed +
    a.duels * PASS_XP.duel +
    a.duelWins * PASS_XP.duelWin
  );
}

export function tierOf(xp: number, s: Season) {
  const tier = Math.min(s.tiers, Math.floor(xp / TIER_XP));
  const into = tier >= s.tiers ? TIER_XP : xp - tier * TIER_XP;
  return { tier, into, progress: into / TIER_XP, maxed: tier >= s.tiers };
}

// ---------------------------------------------------------------- rewards
export type Reward = { coins: number } | { item: string } | { crate: string };
export type TierRewards = { tier: number; free?: Reward; elite?: Reward };

const coins = (n: number): Reward => ({ coins: n });
const item = (id: string): Reward => ({ item: id });
const crate = (key: string): Reward => ({ crate: key });

/** Season 1 · Ignition: 30 tiers. Exclusive items exist only here. */
export const REWARDS: Record<string, TierRewards[]> = {
  s1: Array.from({ length: 30 }, (_, i) => {
    const t = i + 1;
    const free: Record<number, Reward> = {
      5: item("tag:ignition"), 10: crate("rookie"), 15: item("tag:overcharged"), 20: item("banner:hyperspace"), 25: crate("elite"), 30: item("tag:s1"),
    };
    const elite: Record<number, Reward> = {
      1: item("color:ignite"), 6: crate("rookie"), 10: item("tag:afterburner"), 12: crate("elite"), 16: item("banner:ignition"),
      20: item("color:prism"), 22: crate("elite"), 25: item("tag:apex"), 28: crate("mythic"), 30: item("tag:supercharged"),
    };
    return {
      tier: t,
      free: free[t] ?? (t % 2 === 0 ? coins(40 + t * 2) : undefined),
      elite: elite[t] ?? coins(60 + t * 3),
    };
  }),
};

export const rewardRef = (season: string, tier: number, track: "free" | "elite") => `${season}:${tier}:${track}`;

// ---------------------------------------------------------------- quests
export type QuestMetric = keyof Activity | "plays" | "anyWins";
export type Quest = { key: string; desc: string; metric: QuestMetric; target: number; xp: number; coins: number; icon: string };

/** Descriptions are i18n keys ({n} = target). */
export const DAILY_QUESTS: Quest[] = [
  { key: "checkin", desc: "Заберите бонус дня", metric: "checkin", target: 1, xp: 40, coins: 5, icon: "q-gift" },
  { key: "duel", desc: "Сыграйте дуэль", metric: "duels", target: 1, xp: 80, coins: 15, icon: "q-duel" },
  { key: "duelwin", desc: "Выиграйте дуэль", metric: "duelWins", target: 1, xp: 100, coins: 20, icon: "q-win" },
  { key: "goals3", desc: "Забейте {n} гола в матчах или дуэлях", metric: "goals", target: 3, xp: 80, coins: 15, icon: "q-goal" },
  { key: "match", desc: "Сыграйте матч соревнования", metric: "matches", target: 1, xp: 100, coins: 20, icon: "q-match" },
  { key: "win", desc: "Одержите победу в матче или дуэли", metric: "anyWins", target: 1, xp: 100, coins: 20, icon: "q-win" },
  { key: "ref", desc: "Отсудите матч", metric: "refereed", target: 1, xp: 120, coins: 25, icon: "q-ref" },
];

export const WEEKLY_QUESTS: Quest[] = [
  { key: "w-play5", desc: "Сыграйте {n} игр — матчи и дуэли", metric: "plays", target: 5, xp: 400, coins: 60, icon: "q-match" },
  { key: "w-win3", desc: "Одержите {n} победы", metric: "anyWins", target: 3, xp: 400, coins: 60, icon: "q-win" },
  { key: "w-goals15", desc: "Забейте {n} голов", metric: "goals", target: 15, xp: 350, coins: 50, icon: "q-goal" },
  { key: "w-clean", desc: "Выиграйте всухую", metric: "cleanSheets", target: 1, xp: 300, coins: 50, icon: "q-shield" },
  { key: "w-ref2", desc: "Отсудите {n} матча", metric: "refereed", target: 2, xp: 450, coins: 70, icon: "q-ref" },
  { key: "w-duel3", desc: "Сыграйте {n} дуэли", metric: "duels", target: 3, xp: 350, coins: 50, icon: "q-duel" },
];

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function pick<T>(pool: T[], n: number, rnd: () => number) {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rnd() * left.length), 1)[0]);
  return out;
}

/** Today's three quests: the check-in plus two picked for this player and day. */
export function dailyQuests(userId: string, day: string): Quest[] {
  return [DAILY_QUESTS[0], ...pick(DAILY_QUESTS.slice(1), 2, seeded(`dq:${userId}:${day}`))];
}

/** This week's two quests (week = Monday's date). */
export function weeklyQuests(userId: string, week: string): Quest[] {
  return pick(WEEKLY_QUESTS, 2, seeded(`wq:${userId}:${week}`));
}

export function questValue(q: Quest, a: Activity) {
  const v = q.metric === "plays" ? a.matches + a.duels : q.metric === "anyWins" ? a.wins + a.duelWins : a[q.metric];
  return Math.min(v, q.target);
}

/** Tashkent calendar helpers. */
export const tashkentDay = (d = new Date()) => new Date(d.getTime() + TZ_OFFSET).toISOString().slice(0, 10);
export const dayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - TZ_OFFSET);
export function weekOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- daily streak
/** Bonus for a check-in that continues a streak of `streak` days (1 = first day): 10, 15, 20 … up to 40 on day 7+. */
export const streakBonus = (streak: number) => 10 + 5 * Math.min(Math.max(streak, 1) - 1, 6);

/** Length of the streak ending on `day` (or yesterday, if today isn't claimed yet), from claimed days. */
export function streakOf(claimed: Set<string>, day: string) {
  let d = claimed.has(day) ? day : addDays(day, -1);
  let n = 0;
  while (claimed.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
