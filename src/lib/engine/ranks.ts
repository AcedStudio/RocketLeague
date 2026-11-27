// Ranks over the ELO rating, Rocket League style: eight tiers with divisions I–IV (none for SSL),
// shown after a few placement matches. Names are English, like the game.

export type RankTier = { key: string; name: string; min: number; color: string };

export const RANKS: RankTier[] = [
  { key: "bronze", name: "Bronze", min: -Infinity, color: "#D08A4E" },
  { key: "silver", name: "Silver", min: 900, color: "#C9D6E8" },
  { key: "gold", name: "Gold", min: 975, color: "#F5C443" },
  { key: "plat", name: "Platinum", min: 1050, color: "#2EE5C5" },
  { key: "diamond", name: "Diamond", min: 1125, color: "#7FE3FF" },
  { key: "champ", name: "Champion", min: 1200, color: "#B36BFF" },
  { key: "gc", name: "Grand Champion", min: 1300, color: "#FF4D5E" },
  { key: "ssl", name: "Supersonic Legend", min: 1400, color: "#FFFFFF" },
];
export const PLACEMENT_GAMES = 5; // same as the Discord calibration
const BRONZE_FLOOR = 800; // division width for Bronze is measured from here
const ROMAN = ["I", "II", "III", "IV"];

export type Rank =
  | { placed: false; left: number }
  | { placed: true; tier: RankTier; index: number; division: number | null; label: string; progress: number; next: { tier: RankTier; division: number | null; at: number } | null };

/** Where a rating sits: tier, division (1–4) and progress to the next step. */
export function rankOf(rating: number, games: number): Rank {
  if (games < PLACEMENT_GAMES) return { placed: false, left: PLACEMENT_GAMES - games };
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (rating >= RANKS[i].min) index = i;
  const tier = RANKS[index];
  if (tier.key === "ssl") return { placed: true, tier, index, division: null, label: tier.name, progress: 1, next: null };
  const lo = Number.isFinite(tier.min) ? tier.min : BRONZE_FLOOR;
  const hi = RANKS[index + 1].min;
  const width = (hi - lo) / 4;
  const division = Math.max(1, Math.min(4, Math.floor((rating - lo) / width) + 1));
  const stepLo = lo + (division - 1) * width;
  const progress = Math.max(0, Math.min(1, (rating - stepLo) / width));
  const next =
    division < 4
      ? { tier, division: division + 1, at: Math.round(lo + division * width) }
      : { tier: RANKS[index + 1], division: RANKS[index + 1].key === "ssl" ? null : 1, at: hi };
  return { placed: true, tier, index, division, label: `${tier.name} ${ROMAN[division - 1]}`, progress: rating < lo ? 0 : progress, next };
}

export const divisionLabel = (d: number | null) => (d ? ROMAN[d - 1] : "");

/** True when a rating change crosses into a higher tier (not just a division). */
export function rankedUp(before: number, after: number, gamesBefore: number) {
  const a = rankOf(before, gamesBefore);
  const b = rankOf(after, gamesBefore + 1);
  if (!b.placed) return null;
  if (!a.placed) return { kind: "placed" as const, rank: b };
  return b.index > a.index ? { kind: "up" as const, rank: b } : null;
}
