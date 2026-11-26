import { test } from "node:test";
import assert from "node:assert/strict";
import { totalXp, levelOf, xpForLevel, frameUnlocked } from "../src/lib/engine/levels.ts";

const zero = { matches: 0, wins: 0, cleanSheets: 0, refereed: 0, playerOfRound: 0, teamOfRound: 0, achievements: 0, duels: 0, duelWins: 0, titles: 0 };

test("thresholds grow by 50 each level", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 250, 450, 700]);
});
test("new player is level 1 with an empty bar", () => {
  const l = levelOf(totalXp(zero));
  assert.equal(l.level, 1);
  assert.equal(l.progress, 0);
});
test("a full first season lands around level 4", () => {
  const l = levelOf(totalXp({ ...zero, matches: 14, wins: 7, cleanSheets: 2, teamOfRound: 1, achievements: 3 }));
  assert.equal(l.level, 4);
  assert.ok(l.progress > 0 && l.progress < 1);
});
test("frames unlock by level", () => {
  assert.ok(frameUnlocked("neon", 3));
  assert.ok(!frameUnlocked("gold", 4));
  assert.ok(!frameUnlocked("nope", 99));
});
