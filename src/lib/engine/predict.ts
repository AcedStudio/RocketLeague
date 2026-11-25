// Prediction scoring: exact score 3 · right winner and margin 2 · right winner 1.
export const POINTS = { exact: 3, margin: 2, winner: 1 } as const;

export function scorePrediction(pred: { home: number; away: number }, actual: { home: number; away: number }) {
  if (pred.home === actual.home && pred.away === actual.away) return POINTS.exact;
  if (Math.sign(pred.home - pred.away) !== Math.sign(actual.home - actual.away)) return 0;
  return pred.home - pred.away === actual.home - actual.away ? POINTS.margin : POINTS.winner;
}
