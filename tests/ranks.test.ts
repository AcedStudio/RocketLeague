import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { rankOf, rankedUp, RANKS } from "../src/lib/engine/ranks.ts";

test("placement first, then tier and division", () => {
  assert.deepEqual(rankOf(1100, 2), { placed: false, left: 3 });
  const r = rankOf(1000, 5);
  assert.ok(r.placed && r.tier.key === "gold" && r.division === 2 && r.label === "Gold II");
  const top = rankOf(1600, 50);
  assert.ok(top.placed && top.tier.key === "ssl" && top.division === null && top.next === null);
  const low = rankOf(700, 10);
  assert.ok(low.placed && low.tier.key === "bronze" && low.division === 1);
  const edge = rankOf(1124, 10);
  assert.ok(edge.placed && edge.tier.key === "plat" && edge.division === 4 && edge.next?.tier.key === "diamond");
});
test("rank-up only when the tier changes; placement counts as an event", () => {
  assert.equal(rankedUp(990, 1010, 5), null, "division up inside Gold");
  assert.equal(rankedUp(1040, 1060, 5)?.kind, "up");
  assert.equal(rankedUp(1000, 1010, 4)?.kind, "placed");
  assert.equal(rankedUp(1060, 1040, 5), null);
  assert.equal(RANKS.length, 8);
});

import { cleanTag, validTag, validName, clubGoal } from "../src/lib/engine/clubs.ts";
test("club tags and goals", () => {
  assert.equal(cleanTag(" tk-r! "), "TKR");
  assert.ok(validTag("TKR") && !validTag("T") && !validTag("TOOLONG"));
  assert.ok(validName("Rockets") && !validName("ab"));
  assert.equal(clubGoal(1), 10);
  assert.equal(clubGoal(20), 60);
});

import { archetypeOf, seasonStory } from "../src/lib/engine/wrapped.ts";
test("season archetype", () => {
  const line = (won: boolean, gf: number, ga: number) => ({ matchId: "m", opponent: "x", opponentId: null, won, gf, ga, forfeit: false, round: 1 });
  assert.equal(archetypeOf(seasonStory([line(true, 3, 0), line(true, 2, 1), line(true, 4, 1), line(true, 1, 0)]), 0).key, "dominator");
  assert.equal(archetypeOf(seasonStory([line(false, 1, 3)]), 0).key, "fighter");
  assert.equal(archetypeOf(seasonStory([line(true, 6, 4), line(false, 5, 6)]), 0).key, "sniper");
});

import { CHAINS, chapterDone } from "../src/lib/engine/story.ts";
import { findItem as fi } from "../src/lib/engine/shop.ts";
test("story chain rewards exist and chapters check every objective", () => {
  for (const c of CHAINS) for (const ch of c.chapters) if ("item" in ch.reward) assert.ok(fi(ch.reward.item)?.exclusive === "story", ch.reward.item);
  const f = { matches: 1, duels: 0 } as never;
  assert.equal(chapterDone(CHAINS[0].chapters[0], f), false);
});

import { SPECIALS, monthWinners } from "../src/lib/engine/specials.ts";
test("special cards: unique keys, icons; player of the month needs 3+ wins and the most", () => {
  assert.equal(new Set(SPECIALS.map((s) => s.key)).size, SPECIALS.length);
  const sprite = readFileSync(new URL("../public/icons.svg", import.meta.url), "utf8");
  for (const s of SPECIALS) assert.ok(sprite.includes(`id="${s.icon}"`), s.icon);
  const w = monthWinners([{ month: "2026-11", user_id: "a", wins: 5 }, { month: "2026-11", user_id: "b", wins: 6 }, { month: "2026-10", user_id: "a", wins: 2 }]);
  assert.equal(w.get("2026-11")?.user_id, "b");
  assert.equal(w.has("2026-10"), false);
});
