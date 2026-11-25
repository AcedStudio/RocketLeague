// Match of the round: the closest, highest-stakes game among the round's unplayed matches.
export type MotwCandidate = { id: string; homePos: number; awayPos: number; homeElo: number; awayElo: number };

/** Lower is more interesting: neighbours in the table, similar rating, near the top. */
export function interest(c: MotwCandidate, tableKnown: boolean) {
  const eloGap = Math.abs(c.homeElo - c.awayElo) / 40;
  const strength = -(c.homeElo + c.awayElo) / 200;
  if (!tableKnown) return eloGap + strength;
  return Math.abs(c.homePos - c.awayPos) * 3 + eloGap + (c.homePos + c.awayPos) / 2;
}

export function pickMatchOfRound(cands: MotwCandidate[], tableKnown: boolean): MotwCandidate | null {
  if (!cands.length) return null;
  return [...cands].sort((a, b) => interest(a, tableKnown) - interest(b, tableKnown) || a.id.localeCompare(b.id))[0];
}
