import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePrediction } from "../src/lib/engine/predict.ts";

test("exact score gives 3", () => assert.equal(scorePrediction({ home: 3, away: 1 }, { home: 3, away: 1 }), 3));
test("right winner and margin gives 2", () => assert.equal(scorePrediction({ home: 4, away: 2 }, { home: 3, away: 1 }), 2));
test("right winner only gives 1", () => assert.equal(scorePrediction({ home: 5, away: 0 }, { home: 2, away: 1 }), 1));
test("wrong winner gives 0", () => assert.equal(scorePrediction({ home: 1, away: 2 }, { home: 2, away: 1 }), 0));
