// Special card versions: earned by real achievements, each with its own look and a small OVR boost.
import type { TitleFacts } from "./shop.ts";

export type SpecialFacts = TitleFacts & { months: number; passTier: number; storyDone: boolean };
export type Special = {
  key: string; name: string; desc: string; icon: string; boost: number;
  theme: { c1: string; c2: string; ink: string; holo?: boolean };
  earned: (f: SpecialFacts) => boolean;
};

/** Names are English (like FC card types); descriptions are i18n keys. */
export const SPECIALS: Special[] = [
  { key: "wall", name: "The Wall", desc: "5 сухих побед", icon: "ti-fortress", boost: 1, theme: { c1: "#c9d3e3", c2: "#3b4a66", ink: "#0d1524" }, earned: (f) => f.cleanSheets >= 5 },
  { key: "potr", name: "Star of the Round", desc: "Станьте игроком тура", icon: "ti-star", boost: 2, theme: { c1: "#fff2b8", c2: "#c98a12", ink: "#2a1a00", holo: true }, earned: (f) => f.playerOfRound >= 1 },
  { key: "duel", name: "Duel Master", desc: "Займите 1-е место среди дуэлянтов", icon: "ti-duelking", boost: 2, theme: { c1: "#9fb2d1", c2: "#1a2336", ink: "#ffffff" }, earned: (f) => f.topDuellist },
  { key: "potm", name: "Player of the Month", desc: "Больше всех побед за календарный месяц", icon: "ti-winner", boost: 3, theme: { c1: "#7fe3ff", c2: "#0b3d91", ink: "#ffffff", holo: true }, earned: (f) => f.months >= 1 },
  { key: "path", name: "Pathfinder", desc: "Пройдите «Путь чемпиона»", icon: "t-pathfinder", boost: 3, theme: { c1: "#ffe7a3", c2: "#4a2f05", ink: "#fff4d6", holo: true }, earned: (f) => f.storyDone },
  { key: "s1", name: "Season One Hero", desc: "Достигните 30 уровня пропуска Season 1", icon: "t-s1", boost: 3, theme: { c1: "#ffb36b", c2: "#3a0d4f", ink: "#ffffff", holo: true }, earned: (f) => f.passTier >= 30 },
  { key: "champ", name: "Champion", desc: "Выиграйте соревнование", icon: "ti-champion", boost: 4, theme: { c1: "#fff1b8", c2: "#8a5a00", ink: "#1f1300", holo: true }, earned: (f) => f.titles >= 1 },
  { key: "icon", name: "Icon", desc: "Достигните 10 уровня", icon: "ti-legend", boost: 5, theme: { c1: "#ffffff", c2: "#b89350", ink: "#1a1406", holo: true }, earned: (f) => f.level >= 10 },
];

export const specialByKey = (k: string | null | undefined) => (k ? SPECIALS.find((s) => s.key === k) ?? null : null);

/** For each month, the player with the most match wins (at least 3) is Player of the Month. */
export function monthWinners(rows: { month: string; user_id: string; wins: number }[]) {
  const best = new Map<string, { user_id: string; wins: number }>();
  for (const r of rows) {
    const b = best.get(r.month);
    if (r.wins >= 3 && (!b || r.wins > b.wins)) best.set(r.month, { user_id: r.user_id, wins: r.wins });
  }
  return best;
}
