import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStep, duelStep, sortTasks, type MatchFacts } from "../src/lib/engine/today.ts";

const now = new Date("2026-11-28T12:00:00Z");
const base: MatchFacts = { status: "ready", scheduledAt: null, playBy: null, refereeOnly: false, theirProposal: false, myProposal: false, theirReport: false, myReport: false };

test("today: one clear next step per match", () => {
  assert.equal(matchStep({ ...base, status: "upcoming" }, now).key, "tbd");
  assert.equal(matchStep(base, now).key, "schedule");
  assert.equal(matchStep({ ...base, playBy: new Date("2026-11-29T12:00:00Z") }, now).tone, "urgent");
  assert.equal(matchStep({ ...base, theirProposal: true }, now).key, "answer");
  assert.equal(matchStep({ ...base, myProposal: true }, now).key, "proposed");
  assert.equal(matchStep({ ...base, scheduledAt: new Date("2026-11-28T18:00:00Z") }, now).tone, "today");
  assert.equal(matchStep({ ...base, scheduledAt: new Date("2026-12-02T18:00:00Z") }, now).tone, "soon");
  assert.equal(matchStep({ ...base, scheduledAt: new Date("2026-11-28T11:00:00Z") }, now).key, "report");
  assert.equal(matchStep({ ...base, scheduledAt: new Date("2026-11-28T11:00:00Z"), refereeOnly: true }, now).key, "play-ref");
  assert.equal(matchStep({ ...base, status: "under_review", theirReport: true }, now).key, "confirm");
  assert.equal(matchStep({ ...base, status: "under_review", myReport: true }, now).key, "review");
});

test("today: duels and ordering", () => {
  assert.equal(duelStep({ status: "pending", mine: "opponent", reportedByMe: false }).key, "duel-accept");
  assert.equal(duelStep({ status: "pending", mine: "challenger", reportedByMe: false }).tone, "wait");
  assert.equal(duelStep({ status: "reported", mine: "challenger", reportedByMe: false }).key, "duel-confirm");
  const s = sortTasks([
    { id: "w", step: { key: "", label: "", cta: "", tone: "wait" as const }, when: null },
    { id: "s", step: { key: "", label: "", cta: "", tone: "soon" as const }, when: new Date(2) },
    { id: "u", step: { key: "", label: "", cta: "", tone: "urgent" as const }, when: null },
    { id: "s0", step: { key: "", label: "", cta: "", tone: "soon" as const }, when: new Date(1) },
  ]);
  assert.deepEqual(s.map((x) => x.id), ["u", "s0", "s", "w"]);
});
