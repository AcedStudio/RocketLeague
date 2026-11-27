import { test } from "node:test";
import assert from "node:assert/strict";
import { TAGS, TITLES, balance, badgeFor, coinsFromXp } from "../src/lib/engine/shop.ts";

test("coins are half the experience, plus bonuses, minus spending, never negative", () => {
  assert.equal(coinsFromXp(181), 90);
  assert.equal(balance(400, 30, 100), 130);
  assert.equal(balance(100, 0, 500), 0);
});
test("catalogue keys are unique and priced", () => {
  assert.equal(new Set(TAGS.map((t) => t.key)).size, TAGS.length);
  assert.equal(new Set(TITLES.map((t) => t.key)).size, TITLES.length);
  assert.ok(TAGS.every((t) => t.price > 0));
});
test("equipped badge parsing", () => {
  assert.equal(badgeFor("tag:goat")?.item.icon, "🐐");
  assert.equal(badgeFor("title:champion")?.kind, "title");
  assert.equal(badgeFor("tag:nope"), null);
  assert.equal(badgeFor(null), null);
});

import { ITEMS, COLORS, BANNERS, CRATES, rollCrate, itemId, nameColorClass, bannerClass } from "../src/lib/engine/shop.ts";

test("every item id is unique and every name is English (no Cyrillic)", () => {
  assert.equal(new Set(ITEMS.map(itemId)).size, ITEMS.length);
  for (const x of [...ITEMS, ...TITLES, ...CRATES]) assert.doesNotMatch(x.name, /[А-Яа-яЁё]/, x.name);
  assert.ok(TAGS.length >= 25 && TITLES.length >= 25 && COLORS.length >= 10 && BANNERS.length >= 8);
});
test("crate drops respect odds and never repeat an owned item", () => {
  const rookie = CRATES.find((c) => c.key === "rookie")!;
  const low = rollCrate(rookie, new Set(), () => 0)!;
  assert.equal(low.rarity, "common");
  const high = rollCrate(rookie, new Set(), () => 0.99)!;
  assert.equal(high.rarity, "rare");
  // Own every common item → the rookie crate can only drop rares.
  const owned = new Set(ITEMS.filter((i) => i.rarity === "common").map(itemId));
  for (let i = 0; i < 20; i++) assert.equal(rollCrate(rookie, owned, Math.random)!.rarity, "rare");
  // Own everything it could drop → nothing.
  const all = new Set(ITEMS.filter((i) => i.rarity === "common" || i.rarity === "rare").map(itemId));
  assert.equal(rollCrate(rookie, all), null);
});
test("cosmetic classes only for known keys", () => {
  assert.equal(nameColorClass("gold"), "nc nc-gold");
  assert.equal(nameColorClass("x\" onload"), "");
  assert.equal(bannerClass("galaxy"), "bn bn-galaxy");
  assert.equal(bannerClass(null), "");
});

import { dailyDeals, priceToday, titleProgress, featured } from "../src/lib/engine/shop.ts";
test("daily deals: same for a day, one per rarity, discounted; title progress is capped", () => {
  const a = dailyDeals("2026-11-27"), b = dailyDeals("2026-11-27");
  assert.deepEqual(a.map((d) => d.item.key), b.map((d) => d.item.key));
  assert.deepEqual(a.map((d) => d.item.rarity), ["common", "rare", "epic", "legendary"]);
  for (const d of a) assert.ok(d.price < d.item.price && priceToday(d.item, "2026-11-27") === d.price);
  assert.equal(featured("2026-11-23").length, 2);
  const sniper = TITLES.find((t) => t.key === "sniper")!;
  const f = { goals: 40 } as never;
  assert.deepEqual(titleProgress(sniper, f), [25, 25]);
});
