import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCard, ovrFromRating } from "../src/lib/engine/card.ts";

const W = (gf: number, ga: number) => ({ won: true, forfeit: false, games: [{ gf, ga }] });
const L = (gf: number, ga: number) => ({ won: false, forfeit: false, games: [{ gf, ga }] });

test("OVR follows ELO and is capped", () => {
  assert.equal(ovrFromRating(1000), 70);
  assert.equal(ovrFromRating(1150), 80);
  assert.equal(ovrFromRating(3000), 99);
  assert.equal(ovrFromRating(0), 40);
  assert.equal(ovrFromRating(null), 60);
});

test("new player: neutral numbers, all within 30..99", () => {
  const c = computeCard([], null);
  for (const v of [c.atk, c.def, c.win, c.clu, c.frm, c.exp]) assert.ok(v >= 30 && v <= 99);
  assert.equal(c.played, 0);
});

test("dominant player beats a struggling one in every stat but experience", () => {
  const strong = computeCard(Array.from({ length: 12 }, () => W(4, 1)), 1300);
  const weak = computeCard(Array.from({ length: 12 }, () => L(1, 4)), 800);
  for (const k of ["atk", "def", "win", "frm"] as const) assert.ok(strong[k] > weak[k], k);
  assert.equal(strong.exp, weak.exp);
  assert.equal(strong.bestStreak, 12);
  assert.equal(weak.bestStreak, 0);
});

test("small samples are shrunk towards 60", () => {
  const one = computeCard([W(9, 0)], null);
  assert.ok(one.atk < 99 && one.atk > 60);
});

test("forfeits count as results but not as goals; clutch = one-goal games", () => {
  const c = computeCard([{ won: true, forfeit: true, games: [] }, W(3, 2), L(1, 2)], null);
  assert.equal(c.played, 3);
  assert.equal(c.wins, 2);
  assert.equal(c.goalsFor, 4);
  assert.equal(c.goalsAgainst, 4);
});

test("best win streak", () => {
  const c = computeCard([W(1, 0), W(1, 0), L(0, 1), W(1, 0), W(1, 0), W(1, 0)], null);
  assert.equal(c.bestStreak, 3);
});
