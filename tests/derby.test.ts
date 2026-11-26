import { test } from "node:test";
import assert from "node:assert/strict";
import { derbies } from "../src/lib/engine/derby.ts";

const M = (a: string, b: string, winner: string, margin = 1, at = 0) => ({ a, b, winner, margin, at });

test("1–1 after two close games is a derby", () => {
  const d = derbies([M("x", "y", "x"), M("y", "x", "y")]);
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].aWins, d[0].bWins], [1, 1]);
});
test("one-sided series is not a derby", () => {
  assert.equal(derbies([M("x", "y", "x"), M("x", "y", "x"), M("y", "x", "x")]).length, 0);
});
test("blowouts are not a derby even when level", () => {
  assert.equal(derbies([M("x", "y", "x", 6), M("x", "y", "y", 5)]).length, 0);
});
test("more meetings rank higher", () => {
  const d = derbies([M("a", "b", "a"), M("a", "b", "b"), M("c", "d", "c"), M("c", "d", "d"), M("c", "d", "c")]);
  assert.deepEqual([d[0].a, d[0].b], ["c", "d"]);
});
