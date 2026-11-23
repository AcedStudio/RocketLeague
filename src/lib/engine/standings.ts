// League / group table with configurable points and tiebreakers.
// Rocket League has no draws: every series has a winner (overtime).

export type Tiebreaker = "points" | "goal_diff" | "goals_for" | "head_to_head" | "wins";

export const TIEBREAKER_LABELS: Record<Tiebreaker, string> = {
  points: "Очки",
  goal_diff: "Разница голов",
  goals_for: "Забитые голы",
  head_to_head: "Личная встреча",
  wins: "Победы",
};

export const DEFAULT_TIEBREAKERS: Tiebreaker[] = ["points", "goal_diff", "goals_for", "head_to_head"];

export type StandingsConfig = {
  pointsWin: number;
  pointsLoss: number;
  tiebreakers: Tiebreaker[];
};

export type CompletedMatch = {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  winner: string;
};

export type StandingRow = {
  id: string;
  position: number;
  played: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: ("W" | "L")[]; // last five, newest last
};

export function computeStandings(
  ids: readonly string[],
  matches: readonly CompletedMatch[],
  cfg: StandingsConfig,
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of ids) {
    rows.set(id, { id, position: 0, played: 0, wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, form: [] });
  }
  const relevant = matches.filter((m) => rows.has(m.home) && rows.has(m.away));
  for (const m of relevant) {
    const h = rows.get(m.home)!;
    const a = rows.get(m.away)!;
    h.played++;
    a.played++;
    h.goalsFor += m.homeGoals;
    h.goalsAgainst += m.awayGoals;
    a.goalsFor += m.awayGoals;
    a.goalsAgainst += m.homeGoals;
    const homeWon = m.winner === m.home;
    const winner = homeWon ? h : a;
    const loser = homeWon ? a : h;
    winner.wins++;
    loser.losses++;
    winner.points += cfg.pointsWin;
    loser.points += cfg.pointsLoss;
    winner.form.push("W");
    loser.form.push("L");
  }
  for (const r of rows.values()) {
    r.goalDiff = r.goalsFor - r.goalsAgainst;
    r.form = r.form.slice(-5);
  }

  const criteria = cfg.tiebreakers.length ? cfg.tiebreakers : DEFAULT_TIEBREAKERS;
  const ordered = rank([...rows.values()], criteria, relevant, cfg);
  ordered.forEach((r, i) => (r.position = i + 1));
  return ordered;
}

function value(row: StandingRow, c: Tiebreaker, h2h: Map<string, { pts: number; gd: number }> | null): number {
  switch (c) {
    case "points":
      return row.points;
    case "goal_diff":
      return row.goalDiff;
    case "goals_for":
      return row.goalsFor;
    case "wins":
      return row.wins;
    case "head_to_head": {
      const v = h2h?.get(row.id);
      // Points first, goal difference as a fraction keeps it in one number.
      return v ? v.pts * 10000 + v.gd : 0;
    }
  }
}

function headToHead(group: StandingRow[], matches: readonly CompletedMatch[], cfg: StandingsConfig) {
  const ids = new Set(group.map((r) => r.id));
  const map = new Map<string, { pts: number; gd: number }>();
  for (const id of ids) map.set(id, { pts: 0, gd: 0 });
  for (const m of matches) {
    if (!ids.has(m.home) || !ids.has(m.away)) continue;
    const h = map.get(m.home)!;
    const a = map.get(m.away)!;
    h.gd += m.homeGoals - m.awayGoals;
    a.gd += m.awayGoals - m.homeGoals;
    if (m.winner === m.home) {
      h.pts += cfg.pointsWin;
      a.pts += cfg.pointsLoss;
    } else {
      a.pts += cfg.pointsWin;
      h.pts += cfg.pointsLoss;
    }
  }
  return map;
}

function rank(
  group: StandingRow[],
  criteria: Tiebreaker[],
  matches: readonly CompletedMatch[],
  cfg: StandingsConfig,
): StandingRow[] {
  if (group.length <= 1) return group;
  if (criteria.length === 0) return group.slice().sort((a, b) => a.id.localeCompare(b.id));

  const [c, ...rest] = criteria;
  const h2h = c === "head_to_head" ? headToHead(group, matches, cfg) : null;
  const buckets = new Map<number, StandingRow[]>();
  for (const r of group) {
    const v = value(r, c, h2h);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v)!.push(r);
  }
  const keys = [...buckets.keys()].sort((a, b) => b - a);
  // Each tied bucket is ranked again with the remaining criteria; head-to-head
  // is computed only among the entries still tied at that point.
  return keys.flatMap((k) => rank(buckets.get(k)!, rest, matches, cfg));
}
