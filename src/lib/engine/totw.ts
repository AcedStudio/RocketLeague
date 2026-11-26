// Team of the round: who played best this round, from results alone.
export type RoundLine = { userId: string; won: boolean; gf: number; ga: number; eloDelta: number; forfeit: boolean };
export type Pick = RoundLine & { score: number };

/** Win 3 · goal difference 0.4 each (max 5) · clean-sheet win 1 · goals 0.1 · ELO gained /8 (rewards upsets). */
export function performance(l: RoundLine) {
  if (l.forfeit) return 0;
  const gd = Math.max(-5, Math.min(5, l.gf - l.ga));
  return (l.won ? 3 : 0) + gd * 0.4 + (l.won && l.ga === 0 ? 1 : 0) + l.gf * 0.1 + l.eloDelta / 8;
}

/** Best `size` players of the round. Forfeits never count; ties keep the bigger win first. */
export function teamOfRound(lines: RoundLine[], size: number): Pick[] {
  return lines
    .filter((l) => !l.forfeit)
    .map((l) => ({ ...l, score: Math.round(performance(l) * 100) / 100 }))
    .sort((a, b) => b.score - a.score || b.gf - b.ga - (a.gf - a.ga) || a.userId.localeCompare(b.userId))
    .slice(0, size);
}

/** 3 for small leagues, up to 5 for big ones. */
export const teamSize = (players: number) => Math.max(1, Math.min(5, Math.ceil(players / 3)));
