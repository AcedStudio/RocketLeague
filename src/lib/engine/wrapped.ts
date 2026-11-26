// "Your season": one player's story of one competition, from their matches in play order.
export type SeasonLine = { matchId: string; opponent: string; opponentId: string | null; won: boolean; gf: number; ga: number; forfeit: boolean; round: number };

export type SeasonStory = {
  played: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  longestStreak: number;
  bestWin: SeasonLine | null;
  toughestLoss: SeasonLine | null;
  favouriteVictim: { name: string; id: string | null; wins: number } | null;
  nemesis: { name: string; id: string | null; losses: number } | null;
};

export function seasonStory(lines: SeasonLine[]): SeasonStory {
  const real = lines.filter((l) => !l.forfeit);
  let longest = 0;
  let cur = 0;
  for (const l of lines) {
    cur = l.won ? cur + 1 : 0;
    longest = Math.max(longest, cur);
  }
  const pick = (xs: SeasonLine[], f: (l: SeasonLine) => number) => (xs.length ? xs.reduce((a, b) => (f(b) > f(a) ? b : a)) : null);
  const tally = (won: boolean) => {
    const m = new Map<string, { name: string; id: string | null; n: number }>();
    for (const l of lines.filter((x) => x.won === won)) {
      const k = l.opponentId ?? l.opponent;
      m.set(k, { name: l.opponent, id: l.opponentId, n: (m.get(k)?.n ?? 0) + 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n)[0] ?? null;
  };
  const victim = tally(true);
  const nemesis = tally(false);
  return {
    played: lines.length,
    wins: lines.filter((l) => l.won).length,
    losses: lines.filter((l) => !l.won).length,
    goalsFor: real.reduce((s, l) => s + l.gf, 0),
    goalsAgainst: real.reduce((s, l) => s + l.ga, 0),
    cleanSheets: real.filter((l) => l.won && l.ga === 0).length,
    longestStreak: longest,
    bestWin: pick(real.filter((l) => l.won), (l) => (l.gf - l.ga) * 100 + l.gf),
    toughestLoss: pick(real.filter((l) => !l.won), (l) => -(l.ga - l.gf) * 100 + l.gf),
    favouriteVictim: victim ? { name: victim.name, id: victim.id, wins: victim.n } : null,
    nemesis: nemesis ? { name: nemesis.name, id: nemesis.id, losses: nemesis.n } : null,
  };
}
