import { test } from "node:test";
import assert from "node:assert/strict";
import { pickMatchOfRound } from "../src/lib/engine/motw.ts";

const c = (id: string, homePos: number, awayPos: number, homeElo = 1000, awayElo = 1000) => ({ id, homePos, awayPos, homeElo, awayElo });

test("prefers table neighbours near the top", () => {
  const best = pickMatchOfRound([c("a", 1, 8), c("b", 2, 3), c("c", 6, 7)], true);
  assert.equal(best!.id, "b");
});
test("before any results, closest strong ratings win", () => {
  const best = pickMatchOfRound([c("a", 1, 2, 1000, 1300), c("b", 3, 4, 1210, 1200), c("d", 5, 6, 950, 960)], false);
  assert.equal(best!.id, "b");
});
test("empty round gives nothing", () => assert.equal(pickMatchOfRound([], true), null));
