import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateSeason, winChance } from "../src/lib/engine/odds.ts";

const cfg = { pointsWin: 3, pointsLoss: 0, tiebreakers: ["points", "goal_diff", "goals_for"] as const } as never;

test("equal ratings are a coin flip", () => assert.equal(winChance(1000, 1000), 0.5));
test("stronger player is favoured", () => assert.ok(winChance(1200, 1000) > 0.7));

test("finished season: the leader has 100%", () => {
  const odds = simulateSeason({
    ids: ["a", "b"], cfg, topN: 1, runs: 200,
    played: [{ home: "a", away: "b", homeGoals: 3, awayGoals: 1, winner: "a" }],
    remaining: [], ratings: new Map(),
  });
  assert.equal(odds[0].id, "a");
  assert.equal(odds[0].title, 1);
  assert.equal(odds[1].title, 0);
});

test("probabilities add up and favour the stronger side", () => {
  const ids = ["a", "b", "c", "d"];
  const remaining = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) remaining.push({ home: ids[i], away: ids[j] });
  const odds = simulateSeason({ ids, cfg, topN: 2, runs: 3000, played: [], remaining, ratings: new Map([["a", 1300], ["b", 1000], ["c", 1000], ["d", 800]]) });
  const sum = odds.reduce((s, o) => s + o.title, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(odds[0].id, "a");
  assert.ok(odds.find((o) => o.id === "d")!.title < 0.05);
});
