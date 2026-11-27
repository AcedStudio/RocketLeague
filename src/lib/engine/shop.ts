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
  tag("clover", "🍀", "Lucky", 320, "rare"),
  tag("ninja", "🥷", "Ninja", 300, "rare"),
  tag("rocket", "🚀", "Rocketeer", 400, "epic"),
  tag("flip", "🌀", "Flip Reset", 450, "epic"),
  tag("musty", "🌪️", "Musty Flick", 500, "epic"),
  tag("ceiling", "🏗️", "Ceiling Shot", 520, "epic"),
  tag("diamond", "💎", "Diamond", 600, "epic"),
  tag("phoenix", "🦅", "Phoenix", 650, "epic"),
  tag("dragon", "🐉", "Dragon", 680, "epic"),
  tag("gc", "🛡️", "Grand Champ", 700, "epic"),
  tag("turbo", "⏱️", "Turbo", 420, "epic"),
  tag("katana", "🗡️", "Katana", 480, "epic"),
  tag("sakura", "🌸", "Sakura", 480, "epic"),
  tag("viking", "🪓", "Viking", 520, "epic"),
  tag("heart", "💗", "Heartbreaker", 540, "epic"),
  tag("alien", "👽", "Alien", 560, "epic"),
  tag("void", "🕳️", "Void Walker", 640, "epic"),
  tag("crown", "👑", "Arena King", 900, "legendary"),
  tag("nova", "💥", "Supernova", 950, "legendary"),
  tag("skull", "💀", "Skull Crusher", 1000, "legendary"),
  tag("ai", "🤖", "Artificial Intelligence", 1300, "legendary"),
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
type Metric = "matches" | "wins" | "duels" | "goals" | "cleanSheets" | "refereed" | "teamOfRound" | "playerOfRound" | "level" | "longestStreak" | "achievements" | "spent" | "owned" | "titles" | "topDuellist";
export type Title = { key: string; icon: string; name: string; desc: string; rarity: Rarity; metric: Metric; target: number; earned: (f: TitleFacts) => boolean };

const metricValue = (f: TitleFacts, m: Metric) => (m === "topDuellist" ? (f.topDuellist ? 1 : 0) : f[m]);
const title = (key: string, icon: string, name: string, desc: string, rarity: Rarity, metric: Metric, target: number): Title => ({
  key, icon, name, desc, rarity, metric, target, earned: (f) => metricValue(f, metric) >= target,
});
/** How far a player is towards a title: [current (capped), target]. */
export const titleProgress = (t: Title, f: TitleFacts): [number, number] => [Math.min(metricValue(f, t.metric), t.target), t.target];

/** Titles can't be bought — they are earned. Descriptions are i18n keys; names stay English. */
export const TITLES: Title[] = [
  title("rookie", "🎮", "Rookie", "Сыграйте первый матч", "common", "matches", 1),
  title("firstwin", "🎉", "First Blood", "Одержите первую победу", "common", "wins", 1),
  title("grinder", "⛏️", "Grinder", "Сыграйте 10 матчей", "common", "matches", 10),
  title("duelist", "🤺", "Duelist", "Сыграйте 5 дуэлей", "common", "duels", 5),
  title("sniper", "🎯", "Sniper", "Забейте 25 голов", "rare", "goals", 25),
  title("wall", "🧱", "The Wall", "3 сухие победы", "rare", "cleanSheets", 3),
  title("judge", "⚖️", "Arbiter", "Отсудите 3 матча", "rare", "refereed", 3),
  title("inform", "🃏", "In-Form", "Попадите в команду тура", "rare", "teamOfRound", 1),
  title("winner", "🥇", "Winner", "Одержите 10 побед", "rare", "wins", 10),
  title("rising", "📈", "Rising Star", "Достигните 5 уровня", "rare", "level", 5),
  title("star", "⭐", "Star of the Round", "Станьте игроком тура", "epic", "playerOfRound", 1),
  title("unstoppable", "☄️", "Unstoppable", "5 побед подряд", "epic", "longestStreak", 5),
  title("duelking", "⚔️", "Duel King", "Займите 1-е место среди дуэлянтов", "epic", "topDuellist", 1),
  title("veteran", "🏟️", "Veteran", "Сыграйте 30 матчей", "epic", "matches", 30),
  title("machine", "🤖", "Goal Machine", "Забейте 75 голов", "epic", "goals", 75),
  title("fortress", "🏰", "Fortress", "10 сухих побед", "epic", "cleanSheets", 10),
  title("headref", "📋", "Head Referee", "Отсудите 10 матчей", "epic", "refereed", 10),
  title("regular", "🗂️", "Team of the Season", "Попадите в команду тура 3 раза", "epic", "teamOfRound", 3),
  title("conqueror", "🗡️", "Conqueror", "Одержите 25 побед", "epic", "wins", 25),
  title("hunter", "🏅", "Badge Hunter", "Соберите 8 значков", "epic", "achievements", 8),
  title("spender", "💰", "Big Spender", "Потратьте 1000 монет в магазине", "epic", "spent", 1000),
  title("collector", "🧳", "Collector", "Соберите 10 предметов из магазина", "epic", "owned", 10),
  title("legend", "🌟", "Legend", "Достигните 10 уровня", "legendary", "level", 10),
  title("superstar", "💫", "Superstar", "Станьте игроком тура 3 раза", "legendary", "playerOfRound", 3),
  title("invincible", "🛡️", "Invincible", "10 побед подряд", "legendary", "longestStreak", 10),
  title("champion", "🏆", "Champion", "Выиграйте соревнование", "legendary", "titles", 1),
  title("dynasty", "👑", "Dynasty", "Выиграйте 3 соревнования", "legendary", "titles", 3),
];

// ---------- Daily deals: four items a day at a discount, the same for everyone ----------
export const DEAL_DISCOUNT = 0.25;

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
export const dealPrice = (price: number) => Math.max(5, Math.round((price * (1 - DEAL_DISCOUNT)) / 5) * 5);

/** One item of each rarity, picked from the date (YYYY-MM-DD), so the whole site sees the same deals. */
export function dailyDeals(day: string): { item: Item; price: number }[] {
  const rnd = seeded(`deals:${day}`);
  return RARITIES.map((r) => {
    const pool = ITEMS.filter((i) => i.rarity === r);
    const item = pool[Math.floor(rnd() * pool.length)];
    return { item, price: dealPrice(item.price) };
  });
}

/** Two featured legendaries for the week (key = Monday's date). */
export function featured(week: string): Item[] {
  const rnd = seeded(`featured:${week}`);
  const pool = ITEMS.filter((i) => i.rarity === "legendary" || i.rarity === "epic").sort((a, b) => b.price - a.price);
  const a = pool[Math.floor(rnd() * pool.length)];
  const rest = pool.filter((x) => x.kind !== a.kind);
  return [a, rest[Math.floor(rnd() * rest.length)]];
}

/** Price a player pays today: the deal price if the item is in today's deals. */
export function priceToday(item: Item, day: string) {
  return dailyDeals(day).find((d) => itemId(d.item) === itemId(item))?.price ?? item.price;
}

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

/** Sprite icon for a tag, title or achievement (see scripts/icons/build.py). */
export const iconOf = (kind: "tag" | "title" | "ach", key: string) => `${kind === "tag" ? "t" : kind === "title" ? "ti" : "a"}-${key}`;

/** CSS class for a stored name colour / banner key (unknown keys are ignored). */
export const nameColorClass = (key: string | null | undefined) => (key && COLORS.some((c) => c.key === key) ? `nc nc-${key}` : "");
export const bannerClass = (key: string | null | undefined) => (key && BANNERS.some((b) => b.key === key) ? `bn bn-${key}` : "");
