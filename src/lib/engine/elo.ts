// Pure ELO maths. No I/O — the service layer feeds it ratings and stores the deltas.

export const START_RATING = 1000;
export const PROVISIONAL_GAMES = 10;
export const K_PROVISIONAL = 40;
export const K_STABLE = 24;

export type EloPlayer = { id: string; rating: number; games: number };

export function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * How convincing the win was: 1.0 for the narrowest series (3:2 in Bo5),
 * up to 1.5 for a sweep (3:0). In Bo1 the goal difference decides (1 → 1.0, 4+ → 1.3).
 */
export function marginMultiplier(bestOf: number, winnerWins: number, loserWins: number, goalDiff: number) {
  if (bestOf <= 1) return 1 + Math.min(Math.max(goalDiff - 1, 0), 3) * 0.1;
  const need = Math.ceil(bestOf / 2);
  if (need <= 1) return 1;
  const spread = Math.min(Math.max(winnerWins - loserWins - 1, 0), need - 1);
  return 1 + (0.5 * spread) / (need - 1);
}

export const kFactor = (games: number) => (games < PROVISIONAL_GAMES ? K_PROVISIONAL : K_STABLE);

/**
 * Rates one series. Teams are rated by the average of their players; each player
 * moves by their own K, so newcomers calibrate fast without shaking veterans.
 * Returns integer deltas per player id. A winner never gains 0, a loser never gains.
 */
export function rateSeries(winners: EloPlayer[], losers: EloPlayer[], multiplier = 1): Map<string, number> {
  const avg = (ps: EloPlayer[]) => ps.reduce((s, p) => s + p.rating, 0) / ps.length;
  const rw = avg(winners);
  const rl = avg(losers);
  const ew = expectedScore(rw, rl);
  const out = new Map<string, number>();
  for (const p of winners) out.set(p.id, Math.max(1, Math.round(kFactor(p.games) * (1 - ew) * multiplier)));
  for (const p of losers) out.set(p.id, Math.min(-1, Math.round(kFactor(p.games) * (0 - (1 - ew)) * multiplier)));
  return out;
}

export type Tier = { key: string; name: string; min: number; color: string };

// Names stay Russian here: they are translation keys (see scripts/i18n).
export const TIERS: Tier[] = [
  { key: "ssl", name: "Суперсоник-легенда", min: 1600, color: "#f5f5ff" },
  { key: "gc", name: "Гранд-чемпион", min: 1450, color: "#e0525e" },
  { key: "champ", name: "Чемпион", min: 1300, color: "#a77cf2" },
  { key: "diamond", name: "Алмаз", min: 1150, color: "#37befe" },
  { key: "plat", name: "Платина", min: 1000, color: "#88edff" },
  { key: "gold", name: "Золото", min: 850, color: "#d9ad50" },
  { key: "silver", name: "Серебро", min: 700, color: "#b8c4d6" },
  { key: "bronze", name: "Бронза", min: -Infinity, color: "#c0814f" },
];

export function tierOf(rating: number): Tier {
  return TIERS.find((t) => rating >= t.min) ?? TIERS[TIERS.length - 1];
}
