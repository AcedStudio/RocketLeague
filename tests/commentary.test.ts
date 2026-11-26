import { test } from "node:test";
import assert from "node:assert/strict";
import { commentary, seasonRecords, streak, type SeasonGame } from "../src/lib/engine/commentary.ts";

const G = (matchId: string, winner: string, loser: string, wGoals: number, lGoals: number, forfeit = false): SeasonGame => ({ matchId, winner, loser, wGoals, lGoals, forfeit });
const names = { a: "Ace", b: "Bee", c: "Cee", d: "Dee" };

test("streaks count only consecutive wins", () => {
  assert.equal(streak("a", [G("1", "a", "b", 1, 0), G("2", "c", "a", 2, 1), G("3", "a", "d", 3, 0), G("4", "a", "b", 2, 0)]), 2);
});
test("upset, record margin and streak are headlines", () => {
  const before = [G("1", "a", "b", 2, 1), G("2", "a", "c", 3, 2), G("3", "a", "d", 2, 0), G("4", "c", "d", 3, 1)];
  const lines = commentary({ game: G("5", "a", "c", 7, 0), before, names, eloBefore: { winner: 950, loser: 1100 } });
  assert.deepEqual(lines.map((l) => l.key), ["upset", "record_margin", "streak"]);
});
test("broken streak is reported for the loser", () => {
  const before = [G("1", "a", "b", 2, 1), G("2", "a", "c", 2, 1), G("3", "a", "d", 2, 1)];
  const keys = commentary({ game: G("4", "b", "a", 2, 1), before, names }).map((l) => l.key);
  assert.ok(keys.includes("streak_end"));
});
test("forfeits get no commentary", () => assert.deepEqual(commentary({ game: G("1", "a", "b", 0, 0, true), before: [], names }), []));
test("season records", () => {
  const r = seasonRecords([G("1", "a", "b", 5, 0), G("2", "a", "c", 4, 4 - 1), G("3", "b", "a", 2, 1)]);
  assert.equal(r.biggestWin!.matchId, "1");
  assert.equal(r.mostGoals!.matchId, "2");
  assert.deepEqual(r.longestStreak, { id: "a", n: 2 });
  assert.deepEqual(r.topScorer, { id: "a", goals: 10 });
});
