import { test } from "node:test";
import assert from "node:assert/strict";
import { rankOf, rankedUp, RANKS } from "../src/lib/engine/ranks.ts";

test("placement first, then tier and division", () => {
  assert.deepEqual(rankOf(1100, 2), { placed: false, left: 3 });
  const r = rankOf(1000, 5);
  assert.ok(r.placed && r.tier.key === "gold" && r.division === 2 && r.label === "Gold II");
  const top = rankOf(1600, 50);
  assert.ok(top.placed && top.tier.key === "ssl" && top.division === null && top.next === null);
  const low = rankOf(700, 10);
  assert.ok(low.placed && low.tier.key === "bronze" && low.division === 1);
  const edge = rankOf(1124, 10);
  assert.ok(edge.placed && edge.tier.key === "plat" && edge.division === 4 && edge.next?.tier.key === "diamond");
});
test("rank-up only when the tier changes; placement counts as an event", () => {
  assert.equal(rankedUp(990, 1010, 5), null, "division up inside Gold");
  assert.equal(rankedUp(1040, 1060, 5)?.kind, "up");
  assert.equal(rankedUp(1000, 1010, 4)?.kind, "placed");
  assert.equal(rankedUp(1060, 1040, 5), null);
  assert.equal(RANKS.length, 8);
});
