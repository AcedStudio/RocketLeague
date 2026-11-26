import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonStory } from "../src/lib/engine/wrapped.ts";

const L = (opponent: string, gf: number, ga: number, round: number, forfeit = false) => ({ matchId: `${round}`, opponent, opponentId: opponent, won: gf > ga, gf, ga, forfeit, round });

test("season story numbers", () => {
  const s = seasonStory([L("a", 3, 1, 1), L("b", 6, 0, 2), L("a", 2, 1, 3), L("c", 1, 4, 4), L("c", 2, 3, 5)]);
  assert.equal(s.played, 5);
  assert.equal(s.wins, 3);
  assert.equal(s.longestStreak, 3);
  assert.equal(s.goalsFor, 14);
  assert.equal(s.cleanSheets, 1);
  assert.equal(s.bestWin!.opponent, "b");
  assert.equal(s.toughestLoss!.gf, 2, "the closest defeat (2:3)");
  assert.deepEqual(s.favouriteVictim, { name: "a", id: "a", wins: 2 });
  assert.deepEqual(s.nemesis, { name: "c", id: "c", losses: 2 });
});
test("forfeits count as results but not as goals", () => {
  const s = seasonStory([L("a", 0, 0, 1, true)].map((l) => ({ ...l, won: true })));
  assert.equal(s.wins, 1);
  assert.equal(s.goalsFor, 0);
  assert.equal(s.bestWin, null);
});
