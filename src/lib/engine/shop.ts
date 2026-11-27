// Economy: coins come from playing (half of the experience points) plus bonuses; tags are bought, titles are earned.
import type { XpFacts } from "./levels.ts";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Tag = { key: string; icon: string; name: string; price: number; rarity: Rarity };

/** Tags for sale. Names are i18n keys. */
export const TAGS: Tag[] = [
  { key: "gg", icon: "🤝", name: "GG WP", price: 80, rarity: "common" },
  { key: "fire", icon: "🔥", name: "В огне", price: 120, rarity: "common" },
  { key: "uz", icon: "🇺🇿", name: "Uzbek Power", price: 150, rarity: "common" },
  { key: "bolt", icon: "⚡", name: "Молния", price: 200, rarity: "rare" },
  { key: "aerial", icon: "🛫", name: "Аэро-мастер", price: 250, rarity: "rare" },
  { key: "ice", icon: "🧊", name: "Хладнокровный", price: 250, rarity: "rare" },
  { key: "night", icon: "🌙", name: "Ночной охотник", price: 300, rarity: "rare" },
  { key: "rocket", icon: "🚀", name: "Ракета", price: 400, rarity: "epic" },
  { key: "flip", icon: "🌀", name: "Флип-ресет", price: 450, rarity: "epic" },
  { key: "diamond", icon: "💎", name: "Алмаз", price: 600, rarity: "epic" },
  { key: "crown", icon: "👑", name: "Король арены", price: 900, rarity: "legendary" },
  { key: "goat", icon: "🐐", name: "GOAT", price: 1200, rarity: "legendary" },
];

export type TitleFacts = XpFacts & { level: number; longestStreak: number; goals: number; topDuellist: boolean };
export type Title = { key: string; icon: string; name: string; desc: string; rarity: Rarity; earned: (f: TitleFacts) => boolean };

/** Titles can't be bought — they are earned. Descriptions are i18n keys. */
export const TITLES: Title[] = [
  { key: "rookie", icon: "🎮", name: "Новичок арены", desc: "Сыграйте первый матч", rarity: "common", earned: (f) => f.matches >= 1 },
  { key: "sniper", icon: "🎯", name: "Снайпер", desc: "Забейте 25 голов", rarity: "rare", earned: (f) => f.goals >= 25 },
  { key: "wall", icon: "🧱", name: "Стена", desc: "3 сухие победы", rarity: "rare", earned: (f) => f.cleanSheets >= 3 },
  { key: "judge", icon: "⚖️", name: "Арбитр", desc: "Отсудите 3 матча", rarity: "rare", earned: (f) => f.refereed >= 3 },
  { key: "inform", icon: "🃏", name: "In-Form", desc: "Попадите в команду тура", rarity: "rare", earned: (f) => f.teamOfRound >= 1 },
  { key: "star", icon: "⭐", name: "Звезда тура", desc: "Станьте игроком тура", rarity: "epic", earned: (f) => f.playerOfRound >= 1 },
  { key: "unstoppable", icon: "☄️", name: "Неудержимый", desc: "5 побед подряд", rarity: "epic", earned: (f) => f.longestStreak >= 5 },
  { key: "duelist", icon: "⚔️", name: "Король дуэлей", desc: "Займите 1-е место среди дуэлянтов", rarity: "epic", earned: (f) => f.topDuellist },
  { key: "veteran", icon: "🏟️", name: "Ветеран", desc: "Сыграйте 30 матчей", rarity: "epic", earned: (f) => f.matches >= 30 },
  { key: "legend", icon: "🌟", name: "Легенда", desc: "Достигните 10 уровня", rarity: "legendary", earned: (f) => f.level >= 10 },
  { key: "champion", icon: "🏆", name: "Чемпион", desc: "Выиграйте соревнование", rarity: "legendary", earned: (f) => f.titles >= 1 },
];

/** Coins earned from activity: half of the experience points (rounded down). */
export const coinsFromXp = (xp: number) => Math.floor(xp / 2);
export const DAILY_BONUS = 10;

export function balance(xp: number, bonuses: number, spent: number) {
  return Math.max(0, coinsFromXp(xp) + bonuses - spent);
}

/** What a player can show next to their name: tag:KEY (bought) or title:KEY (earned). */
export function badgeFor(equipped: string | null | undefined): { kind: "tag" | "title"; item: Tag | Title } | null {
  if (!equipped) return null;
  const [kind, key] = equipped.split(":");
  if (kind === "tag") {
    const item = TAGS.find((x) => x.key === key);
    return item ? { kind, item } : null;
  }
  if (kind === "title") {
    const item = TITLES.find((x) => x.key === key);
    return item ? { kind, item } : null;
  }
  return null;
}
