import "server-only";
import { one } from "./db";
import { achievementFacts } from "./achievements";
import { totalXp, levelOf, type XpFacts } from "./engine/levels.ts";

export async function xpFacts(userId: string): Promise<XpFacts> {
  const [f, extra] = await Promise.all([
    achievementFacts(userId),
    one<{ team: number; ach: number; duels: number; duel_wins: number }>(
      `select (select count(*)::int from tour_team where user_id = $1) as team,
              (select count(*)::int from user_achievements where user_id = $1) as ach,
              (select count(*)::int from duels where status = 'completed' and $1 in (challenger_id, opponent_id)) as duels,
              (select count(*)::int from duels where status = 'completed' and winner_id = $1) as duel_wins`,
      [userId],
    ),
  ]);
  const real = f.lines.filter((l) => !l.forfeit);
  return {
    matches: f.lines.length,
    wins: f.lines.filter((l) => l.won).length,
    cleanSheets: real.filter((l) => l.won && l.games.length > 0 && l.games.every((g) => g.ga === 0)).length,
    refereed: f.refereed,
    playerOfRound: f.tourAwards,
    teamOfRound: extra?.team ?? 0,
    achievements: extra?.ach ?? 0,
    duels: extra?.duels ?? 0,
    duelWins: extra?.duel_wins ?? 0,
    titles: f.titles,
  };
}

export async function playerLevel(userId: string) {
  const facts = await xpFacts(userId);
  return { ...levelOf(totalXp(facts)), facts };
}
