// Pure "pro stats" maths over a player's results (oldest first).
export type Result = { won: boolean; gf: number; ga: number; at: Date };

export type ProStats = {
  games: number;
  wins: number;
  winrate: number; // 0..1
  streak: { kind: "W" | "L" | null; n: number };
  bestStreak: number;
  avgFor: number;
  avgAgainst: number;
  form: Result[]; // last 10, newest last
  formScore: number; // 0..100, recent games weigh more
  cleanSheets: number;
};

export function proStats(results: Result[]): ProStats {
  const games = results.length;
  const wins = results.filter((r) => r.won).length;
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r.won ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let n = 0;
  const last = results[games - 1];
  for (let i = games - 1; i >= 0 && results[i].won === last?.won; i--) n++;
  const form = results.slice(-10);
  // Linear weights 1..k: the newest result counts k times as much as the oldest of the window.
  let wsum = 0;
  let wwin = 0;
  form.forEach((r, i) => {
    wsum += i + 1;
    if (r.won) wwin += i + 1;
  });
  const sum = (f: (r: Result) => number) => results.reduce((s, r) => s + f(r), 0);
  return {
    games,
    wins,
    winrate: games ? wins / games : 0,
    streak: { kind: last ? (last.won ? "W" : "L") : null, n },
    bestStreak: best,
    avgFor: games ? sum((r) => r.gf) / games : 0,
    avgAgainst: games ? sum((r) => r.ga) / games : 0,
    form,
    formScore: wsum ? Math.round((wwin / wsum) * 100) : 0,
    cleanSheets: results.filter((r) => r.ga === 0).length,
  };
}

/** Local calendar day (YYYY-MM-DD) in a time zone. */
export const dayKey = (d: Date, timeZone: string) => d.toLocaleDateString("en-CA", { timeZone });

/**
 * GitHub-style activity grid: `weeks` columns × 7 rows (Mon..Sun), the last column is the current week.
 * Each cell: date key, count, and level 0..4.
 */
export function activityGrid(dates: Date[], now: Date, timeZone: string, weeks = 26) {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(dayKey(d, timeZone), (counts.get(dayKey(d, timeZone)) ?? 0) + 1);
  const today = new Date(`${dayKey(now, timeZone)}T12:00:00Z`);
  const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
  const start = new Date(today.getTime() - (dow + (weeks - 1) * 7) * 86400_000);
  const max = Math.max(1, ...counts.values());
  const cols: { key: string; count: number; level: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 86400_000);
      const key = day.toISOString().slice(0, 10);
      const count = counts.get(key) ?? 0;
      col.push({ key, count, level: count ? Math.min(4, Math.ceil((count / max) * 4)) : 0, future: day > today });
    }
    cols.push(col);
  }
  const total = cols.flat().reduce((s, c) => s + c.count, 0);
  const activeDays = cols.flat().filter((c) => c.count).length;
  return { cols, total, activeDays };
}
