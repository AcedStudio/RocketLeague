import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAvailability, commonSlots, localParts, hasAvailability } from "../src/lib/engine/availability.ts";

test("availability: cleaning, local time, common evening slots", () => {
  assert.deepEqual(cleanAvailability({ 0: [20, 20, 25, "21"], 9: [1], x: 1 }), { "0": [20, 21] });
  assert.equal(hasAvailability({}), false);
  // 2026-11-30 is a Monday. 15:00 UTC = 20:00 in Tashkent.
  assert.deepEqual(localParts(new Date("2026-11-30T15:00:00Z"), "Asia/Tashkent"), { day: 0, hour: 20 });
  const a = { "0": [19, 20, 21], "1": [20] };
  const b = { "0": [20, 21, 22], "2": [20] };
  const slots = commonSlots([a, b], new Date("2026-11-30T00:00:00Z"), new Date("2026-12-07T00:00:00Z"), "Asia/Tashkent");
  assert.equal(slots.length, 1, "only Monday works for both");
  assert.equal(localParts(slots[0], "Asia/Tashkent").hour, 20);
  assert.deepEqual(commonSlots([a, {}], new Date(), new Date(Date.now() + 7 * 864e5), "Asia/Tashkent"), []);
});
