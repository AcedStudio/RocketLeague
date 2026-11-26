import "server-only";
import { q } from "./db";
import { derbies, rivalries, isDerby, type Meeting, type Rivalry } from "./engine/derby.ts";

/** All 1v1 meetings between players: official matches (solo entries) and completed duels. */
async function meetings(): Promise<Meeting[]> {
  const rows = await q<{ a: string; b: string; winner: string; margin: number; at: Date }>(
    `with solo as (
       select em.entry_id, min(em.user_id::text)::uuid as user_id from entry_members em where em.active group by em.entry_id having count(*) = 1
     )
     select hs.user_id as a, aw.user_id as b, ws.user_id as winner,
            coalesce(m.home_goals, 0) - coalesce(m.away_goals, 0) as margin, coalesce(m.completed_at, m.updated_at) as at
       from matches m
       join solo hs on hs.entry_id = m.home_entry_id join solo aw on aw.entry_id = m.away_entry_id join solo ws on ws.entry_id = m.winner_entry_id
      where m.status = 'completed' and not m.is_bye and not m.forfeit
     union all
     select challenger_id, opponent_id, winner_id, coalesce(ch_goals, 0) - coalesce(op_goals, 0), completed_at
       from duels where status = 'completed'`,
  );
  return rows.map((r) => ({ a: r.a, b: r.b, winner: r.winner, margin: r.margin, at: new Date(r.at).getTime() }));
}

export async function allDerbies() {
  return derbies(await meetings());
}

/** The rivalry between two players (null if they never met), and whether it counts as a derby. */
export async function rivalryBetween(x: string, y: string): Promise<(Rivalry & { derby: boolean; xWins: number; yWins: number }) | null> {
  const r = rivalries((await meetings()).filter((m) => (m.a === x && m.b === y) || (m.a === y && m.b === x)))[0];
  if (!r) return null;
  const xWins = r.a === x ? r.aWins : r.bWins;
  return { ...r, derby: isDerby(r), xWins, yWins: r.meetings - xWins };
}
