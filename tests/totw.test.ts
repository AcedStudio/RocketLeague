import { test } from "node:test";
import assert from "node:assert/strict";
import { teamOfRound, teamSize } from "../src/lib/engine/totw.ts";

const L = (userId: string, gf: number, ga: number, eloDelta = 0, forfeit = false) => ({ userId, won: gf > ga, gf, ga, eloDelta, forfeit });

test("big wins and upsets rank first, losers last", () => {
  const t = teamOfRound([L("a", 3, 2, 10), L("b", 6, 0, 12), L("c", 2, 3, -10), L("d", 4, 3, 30)], 3);
  assert.deepEqual(t.map((p) => p.userId), ["b", "d", "a"]);
});
test("forfeits never make the team", () => {
  assert.deepEqual(teamOfRound([L("a", 0, 0, 0, true), L("b", 1, 2)], 2).map((p) => p.userId), ["b"]);
});
test("team size grows with the league", () => {
  assert.equal(teamSize(4), 2);
  assert.equal(teamSize(8), 3);
  assert.equal(teamSize(9), 3);
  assert.equal(teamSize(30), 5);
});
