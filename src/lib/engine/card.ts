// FUT-style player card numbers, computed from a player's real match history.
// Pure: the service layer passes the matches in chronological order.

export type GameScore = { gf: number; ga: number };
export type MatchLine = { won: boolean; forfeit: boolean; games: GameScore[] };

export type CardStats = {
  ovr: number;
  atk: number; // goals scored per game
  def: number; // goals conceded per game (fewer = better)
  win: number; // series win rate
  clu: number; // one-goal games won
  frm: number; // last five series
  exp: number; // series played
  played: number;
  wins: number;
  bestStreak: number;
  goalsFor: number;
  goalsAgainst: number;
};

export const STAT_KEYS = ["atk", "def", "win", "clu", "frm", "exp"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

const clamp = (v: number, lo = 30, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

/** 1000 ELO ≈ 70 OVR, every 15 points ≈ +1; 1450 (Grand Champion) ≈ 99. */
export function ovrFromRating(rating: number | null): number {
  if (rating === null) return 60;
  return clamp(70 + (rating - 1000) / 15, 40, 99);
}

export function computeCard(lines: MatchLine[], rating: number | null): CardStats {
  const played = lines.length;
  const wins = lines.filter((l) => l.won).length;
  const games = lines.filter((l) => !l.forfeit).flatMap((l) => l.games);
  const gf = games.reduce((s, g) => s + g.gf, 0);
  const ga = games.reduce((s, g) => s + g.ga, 0);
  const close = games.filter((g) => Math.abs(g.gf - g.ga) === 1);
  const closeWon = close.filter((g) => g.gf > g.ga).length;
  const last5 = lines.slice(-5);

  let streak = 0;
  let bestStreak = 0;
  for (const l of lines) {
    streak = l.won ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  // Shrink small samples towards a neutral 60 so two lucky games don't make a 99.
  const shrink = (value: number, n: number, k = 4) => (value * n + 60 * k) / (n + k);
  const perGame = (total: number) => (games.length ? total / games.length : 0);

  return {
    ovr: ovrFromRating(rating),
    atk: clamp(shrink(40 + perGame(gf) * 15, games.length)),
    def: clamp(shrink(99 - perGame(ga) * 15, games.length)),
    win: clamp(shrink(35 + (played ? wins / played : 0) * 64, played)),
    clu: clamp(shrink(35 + (close.length ? closeWon / close.length : 0.5) * 64, close.length)),
    frm: clamp(last5.length ? 40 + (last5.filter((l) => l.won).length / last5.length) * 59 : 60),
    exp: clamp(40 + played * 2.5),
    played,
    wins,
    bestStreak,
    goalsFor: gf,
    goalsAgainst: ga,
  };
}
