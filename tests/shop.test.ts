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
