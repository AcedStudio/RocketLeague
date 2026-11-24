import { test } from "node:test";
import assert from "node:assert/strict";
import { rateSeries, marginMultiplier, expectedScore, tierOf, kFactor } from "../src/lib/engine/elo.ts";

test("equal players: winner +K/2, loser -K/2", () => {
  const d = rateSeries([{ id: "a", rating: 1000, games: 20 }], [{ id: "b", rating: 1000, games: 20 }]);
  assert.equal(d.get("a"), 12);
  assert.equal(d.get("b"), -12);
});

test("upset pays more than expected win", () => {
  const fav = rateSeries([{ id: "a", rating: 1300, games: 20 }], [{ id: "b", rating: 1000, games: 20 }]).get("a")!;
  const upset = rateSeries([{ id: "b", rating: 1000, games: 20 }], [{ id: "a", rating: 1300, games: 20 }]).get("b")!;
  assert.ok(upset > fav);
  assert.ok(fav >= 1);
});

test("newcomers move faster (provisional K)", () => {
  assert.equal(kFactor(0), 40);
  assert.equal(kFactor(10), 24);
  const d = rateSeries([{ id: "new", rating: 1000, games: 0 }], [{ id: "old", rating: 1000, games: 50 }]);
  assert.equal(d.get("new"), 20);
  assert.equal(d.get("old"), -12);
});

test("2v2 uses team average, every member gets a delta", () => {
  const d = rateSeries(
    [{ id: "a1", rating: 1200, games: 20 }, { id: "a2", rating: 800, games: 20 }],
    [{ id: "b1", rating: 1000, games: 20 }, { id: "b2", rating: 1000, games: 20 }],
  );
  assert.equal(d.size, 4);
  assert.equal(d.get("a1"), d.get("a2"));
  assert.equal(d.get("a1"), 12);
});

test("margin: sweep 1.5x, close series 1x, Bo1 by goals", () => {
  assert.equal(marginMultiplier(5, 3, 2, 1), 1);
  assert.equal(marginMultiplier(5, 3, 0, 9), 1.5);
  assert.equal(marginMultiplier(3, 2, 0, 4), 1.5);
  assert.equal(marginMultiplier(1, 1, 0, 1), 1);
  assert.ok(Math.abs(marginMultiplier(1, 1, 0, 6) - 1.3) < 1e-9);
});

test("expected score symmetric, tiers", () => {
  assert.ok(Math.abs(expectedScore(1100, 1000) + expectedScore(1000, 1100) - 1) < 1e-12);
  assert.equal(tierOf(1000).key, "plat");
  assert.equal(tierOf(999).key, "gold");
  assert.equal(tierOf(1700).key, "ssl");
  assert.equal(tierOf(200).key, "bronze");
});
