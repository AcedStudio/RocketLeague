// Economy: coins come from playing (half of the experience points) plus bonuses.
// Tags, name colours and profile banners are bought (or dropped from crates); titles are earned.
// Item names are English on purpose — they're brand-like and stay the same in every language.
import type { XpFacts } from "./levels.ts";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_NAME: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

export type ItemKind = "tag" | "color" | "banner";
export type Item = { kind: ItemKind; key: string; icon: string; name: string; price: number; rarity: Rarity };
export type Tag = Item & { kind: "tag" };

const tag = (key: string, icon: string, name: string, price: number, rarity: Rarity): Item => ({ kind: "tag", key, icon, name, price, rarity });
const color = (key: string, icon: string, name: string, price: number, rarity: Rarity): Item => ({ kind: "color", key, icon, name, price, rarity });
const banner = (key: string, icon: string, name: string, price: number, rarity: Rarity): Item => ({ kind: "banner", key, icon, name, price, rarity });

/** Tags shown next to the nickname. Keys are stored in purchases — never rename a key. */
export const TAGS: Item[] = [
  tag("noob", "🍼", "Certified Noob", 60, "common"),
  tag("gg", "🤝", "GG WP", 80, "common"),
  tag("chaser", "⚽", "Ball Chaser", 90, "common"),
  tag("niceshot", "🎯", "Nice Shot!", 90, "common"),
  tag("save", "🧤", "What a Save!", 100, "common"),
  tag("calc", "🧮", "Calculated", 110, "common"),
  tag("fire", "🔥", "On Fire", 120, "common"),
  tag("uz", "💪", "Uzbek Power", 150, "common"),
  tag("bolt", "⚡", "Lightning", 200, "rare"),
  tag("aerial", "🛫", "Sky Walker", 250, "rare"),
  tag("ice", "🧊", "Ice Cold", 250, "rare"),
  tag("speedflip", "💨", "Speed Flip", 260, "rare"),
  tag("dribble", "🪀", "Dribble God", 270, "rare"),
  tag("demo", "💥", "Demo King", 280, "rare"),
  tag("night", "🌙", "Night Hunter", 300, "rare"),
  tag("ninja", "🥷", "Ninja", 300, "rare"),
  tag("rocket", "🚀", "Rocketeer", 400, "epic"),
  tag("flip", "🌀", "Flip Reset", 450, "epic"),
  tag("musty", "🌪️", "Musty Flick", 500, "epic"),
  tag("ceiling", "🏗️", "Ceiling Shot", 520, "epic"),
  tag("diamond", "💎", "Diamond", 600, "epic"),
  tag("phoenix", "🦅", "Phoenix", 650, "epic"),
  tag("dragon", "🐉", "Dragon", 680, "epic"),
  tag("gc", "🛡️", "Grand Champ", 700, "epic"),
  tag("crown", "👑", "Arena King", 900, "legendary"),
  tag("ghost", "👻", "Untouchable", 1100, "legendary"),
  tag("goat", "🐐", "GOAT", 1200, "legendary"),
  tag("godlike", "🔱", "Godlike", 1400, "legendary"),
  tag("ssl", "🌠", "Supersonic Legend", 1500, "legendary"),
];

/** Name colours: a CSS class nc-KEY on the nickname. */
export const COLORS: Item[] = [
  color("sky", "🔵", "Sky Blue", 150, "common"),
  color("mint", "🟢", "Mint", 150, "common"),
  color("sunset", "🟠", "Sunset", 150, "common"),
  color("rose", "🌸", "Rose", 150, "common"),
  color("gold", "🟡", "Gold", 300, "rare"),
  color("frost", "❄️", "Frost", 350, "rare"),
  color("toxic", "☢️", "Toxic", 350, "rare"),
  color("aurora", "🌌", "Aurora", 600, "epic"),
  color("inferno", "🌋", "Inferno", 600, "epic"),
  color("galaxy", "🪐", "Galaxy", 650, "epic"),
  color("rainbow", "🌈", "Rainbow", 1000, "legendary"),
  color("holo", "💿", "Holographic", 1200, "legendary"),
];

/** Profile banners: a CSS class bn-KEY behind the profile header. */
export const BANNERS: Item[] = [
  banner("midnight", "🌃", "Midnight", 120, "common"),
  banner("ocean", "🌊", "Deep Ocean", 150, "common"),
  banner("stadium", "🏟️", "Stadium Lights", 300, "rare"),
  banner("neon", "🟪", "Neon Grid", 320, "rare"),
  banner("drive", "🌅", "Sunset Drive", 500, "epic"),
  banner("aurora", "🌌", "Northern Lights", 550, "epic"),
  banner("gold", "🏆", "Champions Gold", 600, "epic"),
  banner("galaxy", "✨", "Galaxy", 900, "legendary"),
  banner("supersonic", "☄️", "Supersonic", 1000, "legendary"),
];

export const ITEMS: Item[] = [...TAGS, ...COLORS, ...BANNERS];
export const itemId = (i: Pick<Item, "kind" | "key">) => `${i.kind}:${i.key}`;
export const findItem = (id: string | null | undefined) => (id ? ITEMS.find((i) => itemId(i) === id) ?? null : null);

/** Crates: pay once, get a random item you don't own yet. Cheaper than buying on average — but random. */
export type Crate = { key: string; icon: string; name: string; price: number; odds: Partial<Record<Rarity, number>> };
export const CRATES: Crate[] = [
  { key: "rookie", icon: "📦", name: "Rookie Crate", price: 120, odds: { common: 75, rare: 25 } },
  { key: "elite", icon: "🎁", name: "Elite Crate", price: 450, odds: { rare: 55, epic: 37, legendary: 8 } },
  { key: "mythic", icon: "💠", name: "Mythic Crate", price: 900, odds: { epic: 70, legendary: 30 } },
];

/** Picks the drop: first a rarity by the crate odds (only rarities that still have unowned items), then an item of it. */
export function rollCrate(crate: Crate, owned: Set<string>, rnd: () => number = Math.random): Item | null {
  const left = (r: Rarity) => ITEMS.filter((i) => i.rarity === r && !owned.has(itemId(i)));
  const pool = (Object.entries(crate.odds) as [Rarity, number][]).filter(([r]) => left(r).length > 0);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let x = rnd() * total;
  let rarity = pool[pool.length - 1][0];
  for (const [r, w] of pool) {
    if (x < w) {
      rarity = r;
      break;
    }
    x -= w;
  }
  const items = left(rarity);
  return items[Math.min(items.length - 1, Math.floor(rnd() * items.length))];
}

export type TitleFacts = XpFacts & { level: number; longestStreak: number; goals: number; topDuellist: boolean; spent: number; owned: number };
export type Title = { key: string; icon: string; name: string; desc: string; rarity: Rarity; earned: (f: TitleFacts) => boolean };

/** Titles can't be bought — they are earned. Descriptions are i18n keys; names stay English. */
export const TITLES: Title[] = [
  { key: "rookie", icon: "🎮", name: "Rookie", desc: "Сыграйте первый матч", rarity: "common", earned: (f) => f.matches >= 1 },
  { key: "firstwin", icon: "🎉", name: "First Blood", desc: "Одержите первую победу", rarity: "common", earned: (f) => f.wins >= 1 },
  { key: "grinder", icon: "⛏️", name: "Grinder", desc: "Сыграйте 10 матчей", rarity: "common", earned: (f) => f.matches >= 10 },
  { key: "duelist", icon: "🤺", name: "Duelist", desc: "Сыграйте 5 дуэлей", rarity: "common", earned: (f) => f.duels >= 5 },
  { key: "sniper", icon: "🎯", name: "Sniper", desc: "Забейте 25 голов", rarity: "rare", earned: (f) => f.goals >= 25 },
  { key: "wall", icon: "🧱", name: "The Wall", desc: "3 сухие победы", rarity: "rare", earned: (f) => f.cleanSheets >= 3 },
  { key: "judge", icon: "⚖️", name: "Arbiter", desc: "Отсудите 3 матча", rarity: "rare", earned: (f) => f.refereed >= 3 },
  { key: "inform", icon: "🃏", name: "In-Form", desc: "Попадите в команду тура", rarity: "rare", earned: (f) => f.teamOfRound >= 1 },
  { key: "winner", icon: "🥇", name: "Winner", desc: "Одержите 10 побед", rarity: "rare", earned: (f) => f.wins >= 10 },
  { key: "rising", icon: "📈", name: "Rising Star", desc: "Достигните 5 уровня", rarity: "rare", earned: (f) => f.level >= 5 },
  { key: "star", icon: "⭐", name: "Star of the Round", desc: "Станьте игроком тура", rarity: "epic", earned: (f) => f.playerOfRound >= 1 },
  { key: "unstoppable", icon: "☄️", name: "Unstoppable", desc: "5 побед подряд", rarity: "epic", earned: (f) => f.longestStreak >= 5 },
  { key: "duelking", icon: "⚔️", name: "Duel King", desc: "Займите 1-е место среди дуэлянтов", rarity: "epic", earned: (f) => f.topDuellist },
  { key: "veteran", icon: "🏟️", name: "Veteran", desc: "Сыграйте 30 матчей", rarity: "epic", earned: (f) => f.matches >= 30 },
  { key: "machine", icon: "🤖", name: "Goal Machine", desc: "Забейте 75 голов", rarity: "epic", earned: (f) => f.goals >= 75 },
  { key: "fortress", icon: "🏰", name: "Fortress", desc: "10 сухих побед", rarity: "epic", earned: (f) => f.cleanSheets >= 10 },
  { key: "headref", icon: "📋", name: "Head Referee", desc: "Отсудите 10 матчей", rarity: "epic", earned: (f) => f.refereed >= 10 },
  { key: "regular", icon: "🗂️", name: "Team of the Season", desc: "Попадите в команду тура 3 раза", rarity: "epic", earned: (f) => f.teamOfRound >= 3 },
  { key: "conqueror", icon: "🗡️", name: "Conqueror", desc: "Одержите 25 побед", rarity: "epic", earned: (f) => f.wins >= 25 },
  { key: "hunter", icon: "🏅", name: "Badge Hunter", desc: "Соберите 8 значков", rarity: "epic", earned: (f) => f.achievements >= 8 },
  { key: "spender", icon: "💰", name: "Big Spender", desc: "Потратьте 1000 монет в магазине", rarity: "epic", earned: (f) => f.spent >= 1000 },
  { key: "collector", icon: "🧳", name: "Collector", desc: "Соберите 10 предметов из магазина", rarity: "epic", earned: (f) => f.owned >= 10 },
  { key: "legend", icon: "🌟", name: "Legend", desc: "Достигните 10 уровня", rarity: "legendary", earned: (f) => f.level >= 10 },
  { key: "superstar", icon: "💫", name: "Superstar", desc: "Станьте игроком тура 3 раза", rarity: "legendary", earned: (f) => f.playerOfRound >= 3 },
  { key: "invincible", icon: "🛡️", name: "Invincible", desc: "10 побед подряд", rarity: "legendary", earned: (f) => f.longestStreak >= 10 },
  { key: "champion", icon: "🏆", name: "Champion", desc: "Выиграйте соревнование", rarity: "legendary", earned: (f) => f.titles >= 1 },
  { key: "dynasty", icon: "👑", name: "Dynasty", desc: "Выиграйте 3 соревнования", rarity: "legendary", earned: (f) => f.titles >= 3 },
];

/** Coins earned from activity: half of the experience points (rounded down). */
export const coinsFromXp = (xp: number) => Math.floor(xp / 2);
export const DAILY_BONUS = 10;

export function balance(xp: number, bonuses: number, spent: number) {
  return Math.max(0, coinsFromXp(xp) + bonuses - spent);
}

/** What a player can show next to their name: tag:KEY (bought) or title:KEY (earned). */
export function badgeFor(equipped: string | null | undefined): { kind: "tag" | "title"; item: Item | Title } | null {
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

/** CSS class for a stored name colour / banner key (unknown keys are ignored). */
export const nameColorClass = (key: string | null | undefined) => (key && COLORS.some((c) => c.key === key) ? `nc nc-${key}` : "");
export const bannerClass = (key: string | null | undefined) => (key && BANNERS.some((b) => b.key === key) ? `bn bn-${key}` : "");
