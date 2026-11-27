// Coin predictions: decimal odds from the rating-based win chance with a small margin, so that
// predicting the favourite pays little and an upset pays well. Pure rules, no database.

export const MIN_STAKE = 10;
export const MAX_STAKE = 200;
export const MARGIN = 0.92; // the "house" keeps ~8%, so coins don't inflate
export const STAKE_CHIPS = [10, 25, 50, 100, 200];

/** Decimal odds for a side that wins with probability p (0..1). Clamped to a sane range. */
export function oddsFor(p: number) {
  const fair = 1 / Math.min(0.97, Math.max(0.03, p));
  return Math.max(1.05, Math.min(9.9, Math.round(fair * MARGIN * 100) / 100));
}

export function matchOdds(homeChance: number) {
  return { home: oddsFor(homeChance), away: oddsFor(1 - homeChance) };
}

/** Coins paid back for a winning stake (stake included). */
export const payout = (stake: number, odds: number) => Math.floor(stake * odds);

export function validStake(stake: number) {
  return Number.isInteger(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE;
}
