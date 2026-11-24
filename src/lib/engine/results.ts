// Series validation: a "match" is a Best-of-N series of Rocket League games.

export type GameScore = { home: number; away: number };

export type SeriesResult =
  | { ok: true; homeWins: number; awayWins: number; homeGoals: number; awayGoals: number; winner: "home" | "away" }
  | { ok: false; error: string; params?: Record<string, number> };

export const BEST_OF_OPTIONS = [1, 3, 5, 7] as const;

export function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

export function validateSeries(games: readonly GameScore[], bestOf: number): SeriesResult {
  if (!Number.isInteger(bestOf) || bestOf < 1 || bestOf % 2 === 0) return { ok: false, error: "Неверный формат серии" };
  if (games.length === 0) return { ok: false, error: "Добавьте счёт хотя бы одной игры" };
  if (games.length > bestOf) return { ok: false, error: "В серии Bo{bo} не может быть больше {bo} игр", params: { bo: bestOf } };

  const need = winsNeeded(bestOf);
  let homeWins = 0;
  let awayWins = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!Number.isInteger(g.home) || !Number.isInteger(g.away) || g.home < 0 || g.away < 0 || g.home > 99 || g.away > 99) {
      return { ok: false, error: "Игра {n}: счёт должен быть целым числом от 0 до 99", params: { n: i + 1 } };
    }
    if (g.home === g.away) return { ok: false, error: "Игра {n}: ничьих в Rocket League не бывает (овертайм)", params: { n: i + 1 } };
    if (homeWins === need || awayWins === need) {
      return { ok: false, error: "Серия уже решена до игры {n}", params: { n: i + 1 } };
    }
    if (g.home > g.away) homeWins++;
    else awayWins++;
    homeGoals += g.home;
    awayGoals += g.away;
  }
  if (homeWins !== need && awayWins !== need) {
    return { ok: false, error: "Серия не закончена: нужно побед — {need} (Bo{bo})", params: { need, bo: bestOf } };
  }
  return { ok: true, homeWins, awayWins, homeGoals, awayGoals, winner: homeWins === need ? "home" : "away" };
}

export function sameGames(a: readonly GameScore[], b: readonly GameScore[]): boolean {
  return a.length === b.length && a.every((g, i) => g.home === b[i].home && g.away === b[i].away);
}

/** Parses "3-1, 0-2, 4-3" (home-away per game). */
export function parseGames(text: string): GameScore[] | null {
  const parts = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const out: GameScore[] = [];
  for (const p of parts) {
    const m = /^(\d{1,2})\s*[-:]\s*(\d{1,2})$/.exec(p);
    if (!m) return null;
    out.push({ home: Number(m[1]), away: Number(m[2]) });
  }
  return out;
}
