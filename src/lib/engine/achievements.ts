// Achievements: pure rules over a player's history. The service decides what's new and announces it.
import type { MatchLine } from "./card.ts";

export type AchievementFacts = {
  lines: MatchLine[]; // completed matches, oldest first
  titles: number;
  tourAwards: number;
  refereed: number;
  peakRating: number | null;
};

export type AchievementDef = {
  key: string;
  icon: string;
  name: string; // Russian template (i18n key)
  desc: string; // Russian template, may use {n}
  target: number;
  value: (f: AchievementFacts) => number;
};

const real = (f: AchievementFacts) => f.lines.filter((l) => !l.forfeit);
const games = (f: AchievementFacts) => real(f).flatMap((l) => l.games);
const wins = (f: AchievementFacts) => f.lines.filter((l) => l.won).length;
function bestStreak(f: AchievementFacts) {
  let best = 0, cur = 0;
  for (const l of f.lines) {
    cur = l.won ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_win", icon: "🎯", name: "Первая победа", desc: "Выиграйте свой первый матч", target: 1, value: wins },
  { key: "streak3", icon: "🔥", name: "В ударе", desc: "Выиграйте {n} матча подряд", target: 3, value: bestStreak },
  { key: "streak5", icon: "☄️", name: "Неудержимый", desc: "Выиграйте {n} матчей подряд", target: 5, value: bestStreak },
  {
    key: "clean_sheet", icon: "🧱", name: "Сухарь", desc: "Выиграйте матч, не пропустив ни одного гола", target: 1,
    value: (f) => real(f).filter((l) => l.won && l.games.length > 0 && l.games.every((g) => g.ga === 0)).length,
  },
  { key: "rout", icon: "💥", name: "Разгром", desc: "Выиграйте игру с разницей {n}+ голов", target: 5, value: (f) => Math.max(0, ...games(f).map((g) => g.gf - g.ga)) },
  { key: "clutch", icon: "🧊", name: "Стальные нервы", desc: "Выиграйте {n} игры с разницей в один гол", target: 3, value: (f) => games(f).filter((g) => g.gf - g.ga === 1).length },
  { key: "goals25", icon: "⚽", name: "Снайпер", desc: "Забейте {n} голов", target: 25, value: (f) => games(f).reduce((s, g) => s + g.gf, 0) },
  { key: "goals100", icon: "🚀", name: "Бомбардир", desc: "Забейте {n} голов", target: 100, value: (f) => games(f).reduce((s, g) => s + g.gf, 0) },
  { key: "matches10", icon: "🎮", name: "Завсегдатай", desc: "Сыграйте {n} матчей", target: 10, value: (f) => f.lines.length },
  { key: "matches30", icon: "🏟️", name: "Ветеран", desc: "Сыграйте {n} матчей", target: 30, value: (f) => f.lines.length },
  { key: "referee", icon: "🧑‍⚖️", name: "Арбитр", desc: "Отсудите {n} матча", target: 3, value: (f) => f.refereed },
  { key: "potr", icon: "⭐", name: "Игрок тура", desc: "Победите в голосовании за игрока тура", target: 1, value: (f) => f.tourAwards },
  { key: "elite", icon: "💎", name: "Элита", desc: "Достигните рейтинга {n}", target: 1300, value: (f) => f.peakRating ?? 0 },
  { key: "champion", icon: "🏆", name: "Чемпион", desc: "Выиграйте соревнование", target: 1, value: (f) => f.titles },
];

export type AchievementState = { def: AchievementDef; value: number; done: boolean };

export function evaluate(f: AchievementFacts): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const value = def.value(f);
    return { def, value, done: value >= def.target };
  });
}
