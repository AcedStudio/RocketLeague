import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENTS, currentEvent, nextEvent, eventStart, eventEnd, eventPoints, overlap } from "../src/lib/engine/events.ts";

test("events: windows in Tashkent time, no overlaps, rising milestones, points", () => {
  assert.equal(currentEvent(new Date("2026-11-27T18:59:00Z")), null); // 23:59 on the 27th in Tashkent
  assert.equal(currentEvent(new Date("2026-11-27T19:00:00Z"))?.key, "frostbite");
  assert.equal(currentEvent(new Date("2026-12-31T18:59:00Z"))?.key, "frostbite");
  assert.equal(currentEvent(new Date("2026-12-31T19:00:00Z"))?.key, "newyear");
  assert.equal(nextEvent(new Date("2026-11-01T00:00:00Z"))?.key, "frostbite");
  for (let i = 1; i < EVENTS.length; i++) assert.ok(eventStart(EVENTS[i]) >= eventEnd(EVENTS[i - 1]));
  for (const e of EVENTS) e.milestones.forEach((m, i) => i && assert.ok(m.points > e.milestones[i - 1].points));
  assert.equal(eventPoints({ matches: 2, wins: 1, duels: 1, duelWins: 0, refereed: 1, checkin: 3 }), 20 + 10 + 6 + 8 + 15);
  const o = overlap(EVENTS[0], new Date("2026-12-15T00:00:00Z"), new Date("2027-03-01T00:00:00Z"))!;
  assert.equal(o.from.toISOString(), "2026-12-15T00:00:00.000Z");
  assert.equal(o.to.toISOString(), eventEnd(EVENTS[0]).toISOString());
  assert.equal(overlap(EVENTS[0], new Date("2027-05-01"), new Date("2027-06-01")), null);
});
