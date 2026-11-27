import { test } from "node:test";
import assert from "node:assert/strict";
import { oddsFor, matchOdds, payout, validStake } from "../src/lib/engine/bets.ts";

test("odds: favourite pays little, underdog pays more, margin keeps the expected value below the stake", () => {
  const o = matchOdds(0.75);
  assert.ok(o.home < o.away);
  assert.ok(o.home >= 1.05 && o.away <= 9.9);
  for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) assert.ok(p * oddsFor(p) < 1, `EV at ${p}`);
  assert.equal(oddsFor(0.5), 1.84);
  assert.equal(payout(50, 1.84), 92);
  assert.ok(validStake(10) && validStake(200) && !validStake(5) && !validStake(201) && !validStake(12.5));
});
