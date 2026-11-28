import { test } from "node:test";
import assert from "node:assert/strict";
import { proStats, activityGrid } from "../src/lib/engine/prostats.ts";

const r = (won: boolean, gf = won ? 3 : 1, ga = won ? 1 : 3) => ({ won, gf, ga, at: new Date() });

test("pro stats: streaks, form weighting, averages", () => {
  const s = proStats([r(true), r(true), r(true), r(false), r(true, 2, 0), r(true)]);
  assert.equal(s.games, 6);
  assert.equal(s.wins, 5);
  assert.equal(s.bestStreak, 3);
  assert.deepEqual(s.streak, { kind: "W", n: 2 });
  assert.equal(s.cleanSheets, 1);
  // losing the oldest game hurts less than losing the newest one
  assert.ok(proStats([r(false), r(true), r(true)]).formScore > proStats([r(true), r(true), r(false)]).formScore);
  assert.equal(proStats([]).formScore, 0);
});

test("activity grid: Monday-first weeks, counts per local day, levels", () => {
  const now = new Date("2026-11-28T10:00:00Z"); // Saturday
  const g = activityGrid([new Date("2026-11-28T08:00:00Z"), new Date("2026-11-28T09:00:00Z"), new Date("2026-11-23T10:00:00Z")], now, "Asia/Tashkent", 4);
  assert.equal(g.cols.length, 4);
  const last = g.cols[3];
  assert.equal(last[0].key, "2026-11-23");
  assert.equal(last[0].count, 1);
  assert.equal(last[5].count, 2);
  assert.equal(last[5].level, 4);
  assert.ok(last[6].future);
  assert.equal(g.total, 3);
  assert.equal(g.activeDays, 2);
});
