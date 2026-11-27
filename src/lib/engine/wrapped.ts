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

/** What kind of player the season shows: a named archetype (English, like the titles) with an i18n description. */
export type Archetype = { key: string; name: string; desc: string; icon: string };

export function archetypeOf(s: SeasonStory, eloChange: number): Archetype {
  const real = Math.max(1, s.played);
  const gfPer = s.goalsFor / real;
  const gaPer = s.goalsAgainst / real;
  const winRate = s.wins / real;
  if (s.played >= 3 && winRate >= 0.8) return { key: "dominator", name: "The Dominator", desc: "Побеждал почти всегда — соперники боялись жеребьёвки с тобой", icon: "ti-champion" };
  if (s.played >= 3 && s.cleanSheets >= Math.max(2, s.wins * 0.5)) return { key: "wall", name: "The Wall", desc: "Твои ворота были закрыты на замок — сухие победы одна за другой", icon: "ti-fortress" };
  if (gfPer >= 3.5) return { key: "sniper", name: "The Sniper", desc: "Голы сыпались градом — ты забивал больше всех вокруг", icon: "ti-sniper" };
  if (s.longestStreak >= 4) return { key: "streak", name: "Unstoppable", desc: "Серия побед, которую никто не мог прервать", icon: "ti-unstoppable" };
  if (gfPer + gaPer >= 6) return { key: "showman", name: "The Showman", desc: "Твои матчи — это шоу: много голов с обеих сторон", icon: "t-nova" };
  if (eloChange >= 40) return { key: "rising", name: "Rising Star", desc: "Рейтинг рос от матча к матчу — ты стал заметно сильнее", icon: "ti-rising" };
  if (s.played >= 6) return { key: "grinder", name: "The Grinder", desc: "Ты играл и играл — настоящий трудяга арены", icon: "ti-grinder" };
  return { key: "fighter", name: "The Fighter", desc: "Каждый матч — бой до последней секунды", icon: "ti-duelist" };
}
