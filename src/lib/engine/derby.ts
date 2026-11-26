// Derbies: pairs of players who keep meeting and keep it close.
export type Meeting = { a: string; b: string; winner: string; margin: number; at: number };
export type Rivalry = { a: string; b: string; meetings: number; aWins: number; bWins: number; avgMargin: number; last: number };

const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

export function rivalries(meetings: Meeting[]): Rivalry[] {
  const map = new Map<string, Rivalry & { marginSum: number }>();
  for (const m of meetings) {
    const k = key(m.a, m.b);
    const [a, b] = k.split("|");
    const r = map.get(k) ?? { a, b, meetings: 0, aWins: 0, bWins: 0, avgMargin: 0, last: 0, marginSum: 0 };
    r.meetings++;
    if (m.winner === a) r.aWins++;
    else r.bWins++;
    r.marginSum += Math.abs(m.margin);
    r.last = Math.max(r.last, m.at);
    map.set(k, r);
  }
  return [...map.values()].map(({ marginSum, ...r }) => ({ ...r, avgMargin: marginSum / r.meetings }));
}

/** A derby: met at least twice, nobody leads by more than one win, and games are close on average. */
export function isDerby(r: Rivalry) {
  const gap = Math.abs(r.aWins - r.bWins);
  return r.meetings >= 2 && gap <= 1 && (r.meetings >= 3 || gap === 0) && r.avgMargin <= 3;
}

/** Derbies, hottest first: more meetings, then closer games, then more recent. */
export function derbies(meetings: Meeting[]) {
  return rivalries(meetings)
    .filter(isDerby)
    .sort((x, y) => y.meetings - x.meetings || x.avgMargin - y.avgMargin || y.last - x.last);
}
