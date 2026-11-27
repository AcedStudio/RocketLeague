import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEASONS, REWARDS, tierOf, streakOf, streakBonus, dailyQuests, weeklyQuests, questValue, EMPTY_ACTIVITY, activityXp, weekOf, addDays } from "../src/lib/engine/pass.ts";
import { findItem, PASS_ITEMS, CRATES, rollCrate, iconOf } from "../src/lib/engine/shop.ts";

test("tiers: 200 XP each, capped at the last tier", () => {
  const s = SEASONS[0];
  assert.deepEqual(tierOf(0, s).tier, 0);
  assert.equal(tierOf(450, s).tier, 2);
  assert.equal(tierOf(450, s).into, 50);
  assert.equal(tierOf(1e9, s).tier, s.tiers);
  assert.equal(tierOf(1e9, s).maxed, true);
});
test("every pass reward points at a real item or crate; exclusives never drop from crates", () => {
  for (const r of REWARDS.s1) for (const x of [r.free, r.elite]) {
    if (!x) continue;
    if ("item" in x) assert.ok(findItem(x.item)?.exclusive === "s1", x.item);
    if ("crate" in x) assert.ok(CRATES.some((c) => c.key === x.crate));
  }
  for (let i = 0; i < 200; i++) assert.ok(!rollCrate(CRATES[2], new Set())!.exclusive);
  const sprite = readFileSync(new URL("../public/icons.svg", import.meta.url), "utf8");
  for (const it of PASS_ITEMS.filter((i) => i.kind === "tag")) assert.ok(sprite.includes(`id="${iconOf("tag", it.key)}"`), it.key);
});
test("streak: consecutive days, bonus grows to 40", () => {
  const days = new Set(["2026-11-25", "2026-11-26", "2026-11-27"]);
  assert.equal(streakOf(days, "2026-11-27"), 3);
  assert.equal(streakOf(days, "2026-11-28"), 3, "today not claimed yet → streak still alive");
  assert.equal(streakOf(days, "2026-11-29"), 0);
  assert.deepEqual([1, 2, 7, 30].map(streakBonus), [10, 15, 40, 40]);
});
test("quests: stable per player and day, check-in always first", () => {
  const a = dailyQuests("u1", "2026-11-27"), b = dailyQuests("u1", "2026-11-27");
  assert.deepEqual(a.map((q) => q.key), b.map((q) => q.key));
  assert.equal(a[0].key, "checkin");
  assert.equal(new Set(a.map((q) => q.key)).size, 3);
  assert.equal(weeklyQuests("u1", "2026-11-23").length, 2);
  const act = { ...EMPTY_ACTIVITY, duels: 2, matches: 1, wins: 1, duelWins: 1 };
  assert.equal(questValue({ key: "x", desc: "", metric: "plays", target: 5, xp: 0, coins: 0, icon: "" }, act), 3);
  assert.equal(activityXp(act), 40 + 30 + 2 * 20 + 15);
  assert.equal(weekOf("2026-11-27"), "2026-11-23");
  assert.equal(addDays("2026-11-30", 2), "2026-12-02");
});
