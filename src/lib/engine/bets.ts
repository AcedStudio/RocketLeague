// "Call the winner": free match predictions. No stake and nothing to lose — a correct call earns coins,
// more for an upset (based on the rating win chance). Pure rules, no database.

export const MIN_REWARD = 10;
export const MAX_REWARD = 30;

/** Coins for correctly calling a side that wins with probability p (0..1): 10 for a sure thing, up to 30 for an upset. */
export function rewardFor(p: number) {
  const q = Math.min(1, Math.max(0, p));
  return Math.round(MIN_REWARD + (MAX_REWARD - MIN_REWARD) * (1 - q));
}

export function matchRewards(homeChance: number) {
  return { home: rewardFor(homeChance), away: rewardFor(1 - homeChance) };
}
