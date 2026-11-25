import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/lib/engine/achievements.ts";

const W = (gf: number, ga: number) => ({ won: gf > ga, forfeit: false, games: [{ gf, ga }] });
const base = { titles: 0, tourAwards: 0, refereed: 0, peakRating: null };
const done = (lines: ReturnType<typeof W>[], extra = {}) =>
  new Set(evaluate({ ...base, ...extra, lines }).filter((s) => s.done).map((s) => s.def.key));

test("nothing for a new player", () => assert.equal(done([]).size, 0));
test("first win, clean sheet, rout", () => {
  const d = done([W(6, 0)]);
  assert.ok(d.has("first_win") && d.has("clean_sheet") && d.has("rout"));
  assert.ok(!d.has("streak3"));
});
test("streak counts consecutive wins only", () => {
  assert.ok(done([W(2, 1), W(2, 1), W(1, 2), W(2, 1)]).has("clutch"));
  assert.ok(!done([W(2, 1), W(2, 1), W(1, 2), W(2, 1)]).has("streak3"));
  assert.ok(done([W(1, 2), W(2, 1), W(3, 1), W(4, 1)]).has("streak3"));
});
test("forfeit wins count as wins but not as goals", () => {
  const d = done([{ won: true, forfeit: true, games: [{ gf: 9, ga: 0 }] }]);
  assert.ok(d.has("first_win"));
  assert.ok(!d.has("clean_sheet") && !d.has("rout"));
});
test("external facts", () => {
  const d = done([], { titles: 1, tourAwards: 1, refereed: 3, peakRating: 1310 });
  for (const k of ["champion", "potr", "referee", "elite"]) assert.ok(d.has(k), k);
});
