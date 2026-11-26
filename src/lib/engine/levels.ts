// Player level: experience from everything a player does on the platform. Pure maths.
export type XpFacts = {
  matches: number;
  wins: number;
  cleanSheets: number;
  refereed: number;
  playerOfRound: number;
  teamOfRound: number;
  achievements: number;
  duels: number;
  duelWins: number;
  titles: number;
};

export const XP = {
  match: 20,
  win: 25,
  cleanSheet: 10,
  refereed: 30,
  playerOfRound: 60,
  teamOfRound: 40,
  achievement: 25,
  duel: 10,
  duelWin: 10,
  title: 300,
} as const;

export function totalXp(f: XpFacts) {
  return (
    f.matches * XP.match +
    f.wins * XP.win +
    f.cleanSheets * XP.cleanSheet +
    f.refereed * XP.refereed +
    f.playerOfRound * XP.playerOfRound +
    f.teamOfRound * XP.teamOfRound +
    f.achievements * XP.achievement +
    f.duels * XP.duel +
    f.duelWins * XP.duelWin +
    f.titles * XP.title
  );
}

/** XP needed to reach level n (level 1 = 0): 100, 250, 450, 700, … each step 50 more. */
export const xpForLevel = (n: number) => (n <= 1 ? 0 : 25 * (n - 1) * (n + 2));

export function levelOf(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, xp, from, to, progress: (xp - from) / (to - from) };
}

/** Card frames unlocked by level. Keys are stored on the user; names are i18n keys. */
export const FRAMES = [
  { key: "none", level: 1, name: "Без рамки" },
  { key: "neon", level: 3, name: "Неон" },
  { key: "gold", level: 5, name: "Золото" },
  { key: "flame", level: 8, name: "Пламя" },
  { key: "holo", level: 12, name: "Голограмма" },
] as const;
export type FrameKey = (typeof FRAMES)[number]["key"];

export const frameUnlocked = (key: string, level: number) => FRAMES.some((f) => f.key === key && f.level <= level);
