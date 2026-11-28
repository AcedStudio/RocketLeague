// Story chains: chapters that open one after another. Objectives read lifetime facts.
import type { TitleFacts } from "./shop.ts";

export type Objective = { metric: keyof TitleFacts; target: number; desc: string };
export type Chapter = { title: string; story: string; objectives: Objective[]; reward: { coins: number } | { item: string } };
export type Chain = { key: string; name: string; tagline: string; chapters: Chapter[] };

/** Texts are i18n keys ({n} = target). */
export const CHAINS: Chain[] = [
  {
    key: "champion",
    name: "Path of the Champion",
    tagline: "Путь от новичка до легенды арены",
    chapters: [
      {
        title: "Первый выход",
        story: "Трибуны пока пусты, но каждый чемпион начинал с первого матча.",
        objectives: [
          { metric: "matches", target: 1, desc: "Сыграйте матч соревнования" },
          { metric: "duels", target: 1, desc: "Сыграйте дуэль" },
        ],
        reward: { coins: 50 },
      },
      {
        title: "Вкус победы",
        story: "Первые победы — и соперники начинают запоминать ваш ник.",
        objectives: [
          { metric: "wins", target: 3, desc: "Одержите {n} победы" },
          { metric: "goals", target: 10, desc: "Забейте {n} голов" },
        ],
        reward: { coins: 80 },
      },
      {
        title: "Железная защита",
        story: "Атака выигрывает матчи, защита выигрывает титулы.",
        objectives: [
          { metric: "cleanSheets", target: 2, desc: "Выиграйте всухую {n} раза" },
          { metric: "level", target: 3, desc: "Достигните {n} уровня" },
        ],
        reward: { coins: 120 },
      },
      {
        title: "Звезда тура",
        story: "Ваше имя появляется в команде тура. Арена знает, кто вы.",
        objectives: [
          { metric: "teamOfRound", target: 1, desc: "Попадите в команду тура" },
          { metric: "wins", target: 10, desc: "Одержите {n} побед" },
        ],
        reward: { item: "tag:pathfinder" },
      },
      {
        title: "Легенда арены",
        story: "Серии, трофеи, уровень — путь пройден. Теперь вас знают все.",
        objectives: [
          { metric: "wins", target: 25, desc: "Одержите {n} побед" },
          { metric: "level", target: 8, desc: "Достигните {n} уровня" },
          { metric: "longestStreak", target: 5, desc: "Выиграйте {n} раз подряд" },
        ],
        reward: { item: "avatar:pathfinder" },
      },
    ],
  },
];

export function objectiveValue(o: Objective, f: TitleFacts) {
  const v = f[o.metric];
  return Math.min(typeof v === "boolean" ? (v ? 1 : 0) : v, o.target);
}
export const chapterDone = (c: Chapter, f: TitleFacts) => c.objectives.every((o) => objectiveValue(o, f) >= o.target);
