import "server-only";
import { q } from "./db";
import { listCompetitions, getMatches } from "./data";
import type { Match, Competition } from "./data";

export type LiveState = "final" | "review" | "live" | "soon" | "unscheduled";
export type LiveMatch = Match & { state: LiveState };
export type LiveComp = { comp: Competition; label: { stage: string; round: number | null }; matches: LiveMatch[]; done: number; total: number };

const STAGE_RANK: Record<string, number> = { group: 0, league: 0, knockout: 1, third_place: 1 };

/** How a match looks right now: finished, under review, being played (its time has come), coming up, or not scheduled. */
export function liveState(m: Match, now = Date.now()): LiveState {
  if (m.status === "completed") return "final";
  if (m.status === "under_review") return "review";
  if (m.status === "live") return "live";
  if (m.scheduled_at && m.time_confirmed) {
    const at = new Date(m.scheduled_at).getTime();
    if (at <= now && now - at < 3 * 3600_000) return "live";
    if (at > now) return "soon";
  }
  return "unscheduled";
}

/** For each running competition: the round being played now (the earliest with unfinished matches), or the last one. */
export async function liveBoard(): Promise<LiveComp[]> {
  const comps = (await listCompetitions()).filter((c) => ["in_progress", "playoffs"].includes(c.status));
  const out: LiveComp[] = [];
  for (const comp of comps) {
    const all = (await getMatches(comp.id)).filter((m) => !m.is_bye && m.home_entry_id && m.away_entry_id);
    if (!all.length) continue;
    const key = (m: Match) => `${STAGE_RANK[m.stage] ?? 9}:${String(m.round ?? 0).padStart(3, "0")}`;
    const open = all.filter((m) => m.status !== "completed").sort((a, b) => key(a).localeCompare(key(b)));
    const focus = open.length ? key(open[0]) : all.map(key).sort().pop()!;
    const matches = all
      .filter((m) => key(m) === focus)
      .map((m) => ({ ...m, state: liveState(m) }))
      .sort((a, b) => order(a.state) - order(b.state) || (a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity) - (b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity));
    out.push({ comp, label: { stage: matches[0].stage, round: matches[0].round }, matches, done: matches.filter((m) => m.state === "final").length, total: matches.length });
  }
  return out;
}

const order = (s: LiveState) => ({ live: 0, review: 1, soon: 2, unscheduled: 3, final: 4 })[s];

export type FeedItem = { id: string; at: Date; text: string; params: Record<string, string | number>; match_id: string; slug: string; home: string | null; away: string | null };

/** Latest happenings in running competitions: results, reports, schedule agreements… */
export async function liveFeed(limit = 25): Promise<FeedItem[]> {
  return q<FeedItem>(
    `select e.id::text, e.created_at as at, e.text, e.params, e.match_id, c.slug, he.name as home, ae.name as away
       from match_events e
       join matches m on m.id = e.match_id
       join competitions c on c.id = m.competition_id
       left join entries he on he.id = m.home_entry_id
       left join entries ae on ae.id = m.away_entry_id
      where c.status in ('in_progress', 'playoffs') and e.created_at > now() - interval '7 days'
      order by e.created_at desc limit $1`,
    [limit],
  );
}
