import { test } from "node:test";
import assert from "node:assert/strict";
import { drawGroups, validateDraw } from "../src/lib/engine/draw.ts";
import { roundRobin } from "../src/lib/engine/roundRobin.ts";
import { buildKnockout, seedOrder, seedQualifiers, roundLabel } from "../src/lib/engine/knockout.ts";
import { computeStandings, DEFAULT_TIEBREAKERS } from "../src/lib/engine/standings.ts";
import { validateSeries, parseGames } from "../src/lib/engine/results.ts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

test("draw: balanced groups for many participant counts, no duplicates or losses", () => {
  for (let n = 4; n <= 64; n++) {
    for (const G of [1, 2, 3, 4, 8]) {
      if (validateDraw(n, G)) continue;
      const r = drawGroups(ids(n).map((id) => ({ id })), { groupCount: G, seeded: false, seed: n * 31 + G });
      const sizes = r.groups.map((g) => g.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `n=${n} G=${G} sizes=${sizes}`);
      const flat = r.groups.flat();
      assert.equal(flat.length, n);
      assert.equal(new Set(flat).size, n);
    }
  }
});

test("draw: same seed reproduces, different seed changes", () => {
  const e = ids(16).map((id) => ({ id }));
  const a = drawGroups(e, { groupCount: 4, seeded: false, seed: 42 });
  const b = drawGroups(e, { groupCount: 4, seeded: false, seed: 42 });
  const c = drawGroups(e, { groupCount: 4, seeded: false, seed: 43 });
  assert.deepEqual(a.groups, b.groups);
  assert.notDeepEqual(a.groups, c.groups);
});

test("draw: seeded pots keep top seeds apart", () => {
  const e = ids(16).map((id, i) => ({ id, seed: i + 1 }));
  for (let s = 0; s < 50; s++) {
    const r = drawGroups(e, { groupCount: 4, seeded: true, seed: s });
    for (const g of r.groups) {
      const top = g.filter((id) => Number(id.slice(1)) <= 4);
      assert.equal(top.length, 1, "each group gets exactly one pot-1 team");
    }
  }
});

test("draw: fairness — each participant lands in each group roughly equally", () => {
  const e = ids(8).map((id) => ({ id }));
  const counts = new Map<string, number>();
  const N = 4000;
  for (let s = 0; s < N; s++) {
    const r = drawGroups(e, { groupCount: 2, seeded: false, seed: s + 1 });
    for (const id of r.groups[0]) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [, c] of counts) {
    const share = c / N;
    assert.ok(share > 0.45 && share < 0.55, `share in group A = ${share}`);
  }
});

test("draw: rejects too few participants and duplicates", () => {
  assert.ok(validateDraw(5, 3));
  assert.throws(() => drawGroups([{ id: "a" }, { id: "a" }, { id: "b" }, { id: "c" }], { groupCount: 1, seeded: false, seed: 1 }));
});

test("round robin: everyone meets everyone exactly once, odd counts supported", () => {
  for (let n = 2; n <= 13; n++) {
    const f = roundRobin(ids(n));
    assert.equal(f.length, (n * (n - 1)) / 2);
    const pairs = new Set(f.map((x) => [x.home, x.away].sort().join("|")));
    assert.equal(pairs.size, f.length, "no duplicate fixtures");
    // Nobody plays twice in one round.
    const byRound = new Map<number, string[]>();
    for (const x of f) byRound.set(x.round, [...(byRound.get(x.round) ?? []), x.home, x.away]);
    for (const [, p] of byRound) assert.equal(new Set(p).size, p.length);
  }
});

test("round robin: double round has reversed home/away", () => {
  const f = roundRobin(ids(4), { double: true });
  assert.equal(f.length, 12);
  const first = f.filter((x) => x.round <= 3);
  for (const m of first) assert.ok(f.some((x) => x.round > 3 && x.home === m.away && x.away === m.home));
});

test("knockout: seed order keeps 1 and 2 apart", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("knockout: byes for non power-of-two counts and auto advance", () => {
  for (let n = 2; n <= 32; n++) {
    const b = buildKnockout(ids(n), { thirdPlace: true });
    const r1 = b.matches.filter((m) => m.round === 1 && m.stage === "knockout");
    const byes = r1.filter((m) => m.isBye);
    assert.equal(byes.length, b.size - n, `n=${n}`);
    for (const m of r1) assert.ok(m.home || m.away, "no empty first-round match");
    // Byes go to the top seeds.
    for (const m of byes) assert.ok(Number(m.winner!.slice(1)) <= b.size - n);
    const finals = b.matches.filter((m) => m.nextKey === null && m.stage === "knockout");
    assert.equal(finals.length, 1);
    if (b.rounds >= 2) assert.ok(b.matches.some((m) => m.stage === "third_place"));
  }
});

test("knockout: labels", () => {
  assert.equal(roundLabel(4, 4), "Финал");
  assert.equal(roundLabel(3, 4), "Полуфинал");
  assert.equal(roundLabel(2, 4), "1/4 финала");
  assert.equal(roundLabel(1, 4), "1/8 финала");
});

test("qualifiers: group winners seeded first and same-group pairs avoided", () => {
  const rows = ["A", "B", "C", "D"].flatMap((g, gi) => [
    { id: `${g}1`, group: g, position: 1, points: 9 - gi, goalDiff: 5, goalsFor: 10 },
    { id: `${g}2`, group: g, position: 2, points: 6 - gi, goalDiff: 1, goalsFor: 8 },
  ]);
  const seeds = seedQualifiers(rows);
  assert.deepEqual(seeds.slice(0, 4).map((s) => s.endsWith("1")), [true, true, true, true]);
  const bracket = buildKnockout(seeds);
  for (const m of bracket.matches.filter((x) => x.round === 1)) {
    assert.notEqual(m.home![0], m.away![0], `same group clash ${m.home} v ${m.away}`);
  }
});

test("standings: points, goal difference, head-to-head", () => {
  const cfg = { pointsWin: 3, pointsLoss: 0, tiebreakers: DEFAULT_TIEBREAKERS };
  const m = (home: string, away: string, hg: number, ag: number) => ({ home, away, homeGoals: hg, awayGoals: ag, winner: hg > ag ? home : away });
  // a beats b, b beats c, c beats a: all 3 pts; goal diff decides.
  const rows = computeStandings(["a", "b", "c", "d"], [m("a", "b", 3, 0), m("b", "c", 2, 1), m("c", "a", 1, 0), m("a", "d", 2, 0), m("b", "d", 1, 0), m("c", "d", 1, 0)], cfg);
  // a +4, c +1, b -1 on goal difference.
  assert.deepEqual(rows.map((r) => r.id), ["a", "c", "b", "d"]);
  assert.equal(rows[0].points, 6);
  assert.equal(rows[3].points, 0);
  assert.equal(rows[0].goalDiff, 4);

  // Exact tie on points, GD and GF: head-to-head decides.
  const t = computeStandings(["x", "y"], [m("x", "y", 2, 1), m("y", "x", 2, 1)], { ...cfg, tiebreakers: ["points", "goal_diff", "goals_for", "head_to_head"] });
  assert.equal(t[0].points, t[1].points);
  const h2h = computeStandings(["x", "y", "z"], [m("x", "y", 1, 0), m("y", "z", 1, 0), m("z", "x", 1, 0), m("y", "x", 0, 1)], cfg);
  assert.equal(h2h[0].id, "x");
});

test("series validation", () => {
  assert.equal(validateSeries([{ home: 3, away: 1 }], 1).ok, true);
  assert.equal(validateSeries([{ home: 2, away: 2 }], 1).ok, false, "no draws");
  assert.equal(validateSeries([{ home: 3, away: 1 }], 3).ok, false, "unfinished Bo3");
  const r = validateSeries([{ home: 3, away: 1 }, { home: 0, away: 2 }, { home: 4, away: 3 }], 3);
  assert.ok(r.ok && r.winner === "home" && r.homeGoals === 7 && r.awayGoals === 6);
  assert.equal(validateSeries([{ home: 3, away: 1 }, { home: 3, away: 2 }, { home: 1, away: 2 }], 3).ok, false, "game after decided");
  assert.deepEqual(parseGames("3-1, 0:2"), [{ home: 3, away: 1 }, { home: 0, away: 2 }]);
  assert.equal(parseGames("3-x"), null);
});

test("season calendar: tours spread evenly, last tour on the last day", async () => {
  const { seasonDeadlineDays } = await import("../src/lib/engine/roundRobin.ts");
  assert.deepEqual(seasonDeadlineDays(10, 30), [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
  const d22 = seasonDeadlineDays(22, 30);
  assert.equal(d22.length, 22);
  assert.equal(d22[21], 30);
  for (let i = 1; i < d22.length; i++) assert.ok(d22[i] >= d22[i - 1]);
  assert.deepEqual(seasonDeadlineDays(40, 30).slice(0, 3), [1, 2, 3]);
  assert.deepEqual(seasonDeadlineDays(0, 30), []);
});
