import { test } from "node:test";
import assert from "node:assert/strict";
import { reliability, payFor, REF_TRACK, PAY_FAST, PAY_NORMAL } from "../src/lib/engine/referee.ts";

test("referee: pay, reliability shrinkage, corrections and overdue hurt", () => {
  assert.equal(payFor(30), PAY_FAST);
  assert.equal(payFor(2000), PAY_NORMAL);
  assert.equal(payFor(null), PAY_NORMAL);
  assert.equal(reliability([]), null);
  const fast = (n: number) => Array.from({ length: n }, () => ({ minutes: 20, corrected: false }));
  assert.ok(reliability(fast(1))! < reliability(fast(20))!, "one match can't max it out");
  assert.equal(reliability(fast(20)), 100);
  const withFix = [...fast(19), { minutes: 20, corrected: true }];
  assert.ok(reliability(withFix)! < 100);
  assert.equal(reliability(fast(20), 2), 90);
  assert.ok(REF_TRACK.every((t, i) => i === 0 || t.need > REF_TRACK[i - 1].need));
});
