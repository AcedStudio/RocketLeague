import "server-only";
import { one, q } from "./db";
import { getMatches, getStandings, type Competition, type Match } from "./data";
import { entryRatings } from "./rating";
import { enqueueChannel } from "./discord";
import { notifyEntries } from "./notify";
import { pickMatchOfRound } from "./engine/motw.ts";

export type MatchOfRound = {
  match: Match;
  round: number;
  homePos: number | null;
  awayPos: number | null;
  homeElo: number;
  awayElo: number;
};

/** The match of the current league round (lowest round with unplayed games), or null. */
export async function matchOfRound(comp: Competition): Promise<MatchOfRound | null> {
  if (comp.draw_state !== "published" || comp.format !== "round_robin") return null;
  const matches = await getMatches(comp.id);
  const league = matches.filter((m) => m.stage === "league" && !m.is_bye && m.home_entry_id && m.away_entry_id);
  const open = league.filter((m) => !["completed", "under_review"].includes(m.status));
  if (!open.length) return null;
  const round = Math.min(...open.map((m) => m.round));
  const [tables, elos] = await Promise.all([getStandings(comp), entryRatings(comp.id)]);
  const pos = new Map(tables.flatMap((g) => g.rows.map((r) => [r.id, r.position] as const)));
  const elo = new Map(elos.map((e) => [e.entry_id, e.rating]));
  const tableKnown = league.some((m) => m.status === "completed");
  const cands = open
    .filter((m) => m.round === round)
    .map((m) => ({
      id: m.id,
      homePos: pos.get(m.home_entry_id!) ?? 99,
      awayPos: pos.get(m.away_entry_id!) ?? 99,
      homeElo: elo.get(m.home_entry_id!) ?? 1000,
      awayElo: elo.get(m.away_entry_id!) ?? 1000,
    }));
  const best = pickMatchOfRound(cands, tableKnown);
  if (!best) return null;
  return {
    match: open.find((m) => m.id === best.id)!,
    round,
    homePos: tableKnown ? best.homePos : null,
    awayPos: tableKnown ? best.awayPos : null,
    homeElo: best.homeElo,
    awayElo: best.awayElo,
  };
}

/** Announces each round's match once (Discord + the two players). Called from the sweep. */
export async function announceMatchesOfRound() {
  const comps = await q<Competition>(
    "select * from competitions where draw_state = 'published' and format = 'round_robin' and status in ('in_progress', 'playoffs')",
  );
  for (const comp of comps) {
    const motw = await matchOfRound(comp);
    if (!motw) continue;
    const claimed = await one(
      "insert into settings (key, value) values ($1, $2) on conflict (key) do nothing returning key",
      [`motw:${comp.id}:${motw.round}`, motw.match.id],
    );
    if (!claimed) continue;
    const m = motw.match;
    await enqueueChannel(undefined, "announce", {
      title: "🔥 {comp}: матч тура {n}",
      description: "{home} — {away}",
      params: { comp: comp.name, n: motw.round, home: m.home_name ?? "", away: m.away_name ?? "" },
      image: `/api/match-card/${m.id}?v=motw-${motw.round}`,
      link: `/match/${m.id}`,
      color: 0xd9ad50,
    });
    await notifyEntries(undefined, [m.home_entry_id, m.away_entry_id], "🔥 Ваш матч — матч тура {n}!", "{comp} · {home} — {away}. Все будут следить за этой игрой.", `/match/${m.id}`, {
      n: motw.round,
      comp: comp.name,
      home: m.home_name ?? "",
      away: m.away_name ?? "",
    });
  }
}
