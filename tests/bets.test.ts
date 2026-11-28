import { test } from "node:test";
import assert from "node:assert/strict";
import { rewardFor, matchRewards } from "../src/lib/engine/bets.ts";

test("free predictions: calling the underdog pays more, always between 10 and 30 coins", () => {
  const r = matchRewards(0.75);
  assert.ok(r.home < r.away);
  assert.equal(rewardFor(1), 10);
  assert.equal(rewardFor(0), 30);
  assert.equal(rewardFor(0.5), 20);
});
