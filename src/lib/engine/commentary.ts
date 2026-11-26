// Match commentary: the few facts worth a headline, from one result and the season so far.
export type SeasonGame = { matchId: string; winner: string; loser: string; wGoals: number; lGoals: number; forfeit: boolean };
export type Line = { key: string; text: string; params: Record<string, string | number> };

export type CommentaryInput = {
  game: SeasonGame;
  /** Completed games of the competition before this one, oldest first. */
  before: SeasonGame[];
  names: Record<string, string>;
  /** Ratings before this match (only when rated). */
  eloBefore?: { winner: number; loser: number };
};

/** Current win streak of `id` after `games` (oldest first). */
export function streak(id: string, games: SeasonGame[]) {
  let n = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    if (g.winner === id) n++;
    else if (g.loser === id) break;
  }
  return n;
}

export function commentary({ game, before, names, eloBefore }: CommentaryInput): Line[] {
  if (game.forfeit) return [];
  const out: Line[] = [];
  const W = names[game.winner] ?? "?";
  const L = names[game.loser] ?? "?";
  const margin = game.wGoals - game.lGoals;
  const total = game.wGoals + game.lGoals;
  const real = before.filter((g) => !g.forfeit);

  if (eloBefore && eloBefore.loser - eloBefore.winner >= 75)
    out.push({ key: "upset", text: "😱 Сенсация! {w} (ELO {we}) обыграл {l} (ELO {le})", params: { w: W, l: L, we: eloBefore.winner, le: eloBefore.loser } });

  if (real.length >= 3 && margin >= 3 && margin > Math.max(...real.map((g) => g.wGoals - g.lGoals)))
    out.push({ key: "record_margin", text: "💥 Новый рекорд сезона: самая крупная победа — {score}", params: { score: `${game.wGoals}:${game.lGoals}` } });
  else if (real.length >= 3 && total >= 8 && total > Math.max(...real.map((g) => g.wGoals + g.lGoals)))
    out.push({ key: "record_goals", text: "🎆 Новый рекорд сезона: больше всего голов в матче — {n}", params: { n: total } });

  const after = [...before, game];
  const ws = streak(game.winner, after);
  if (ws >= 3) out.push({ key: "streak", text: "🔥 {w}: побед подряд — {n}", params: { w: W, n: ws } });
  const broken = streak(game.loser, before);
  if (broken >= 3) out.push({ key: "streak_end", text: "⛔ Серия {l} прервана на {n} победах", params: { l: L, n: broken } });

  if (game.lGoals === 0 && game.wGoals > 0 && out.length < 3) out.push({ key: "clean", text: "🧱 Сухая победа {w}", params: { w: W } });
  return out.slice(0, 3);
}

export type Records = {
  biggestWin: SeasonGame | null;
  mostGoals: SeasonGame | null;
  longestStreak: { id: string; n: number } | null;
  topScorer: { id: string; goals: number } | null;
};

export function seasonRecords(games: SeasonGame[]): Records {
  const real = games.filter((g) => !g.forfeit);
  const by = (f: (g: SeasonGame) => number) => (real.length ? real.reduce((a, b) => (f(b) > f(a) ? b : a)) : null);
  const ids = [...new Set(games.flatMap((g) => [g.winner, g.loser]))];
  let longest: { id: string; n: number } | null = null;
  for (const id of ids) {
    let cur = 0;
    for (const g of games) {
      if (g.winner === id) cur++;
      else if (g.loser === id) cur = 0;
      if (!longest || cur > longest.n) longest = cur > 0 ? { id, n: cur } : longest;
    }
  }
  const goals = new Map<string, number>();
  for (const g of real) {
    goals.set(g.winner, (goals.get(g.winner) ?? 0) + g.wGoals);
    goals.set(g.loser, (goals.get(g.loser) ?? 0) + g.lGoals);
  }
  const top = [...goals.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    biggestWin: by((g) => g.wGoals - g.lGoals),
    mostGoals: by((g) => g.wGoals + g.lGoals),
    longestStreak: longest,
    topScorer: top ? { id: top[0], goals: top[1] } : null,
  };
}
