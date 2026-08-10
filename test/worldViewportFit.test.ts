import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale } from "../client/src/lib/worldViewport";

test("short Safari world view contains the authored composition locally", () => {
  const scale = calculateWorldFitScale(390, 760, 1621, true);
  assert.equal(scale, 390 / 1080);
  assert.ok(1621 * scale < 760);
});

test("standalone portrait world view preserves the existing cover presentation", () => {
  const scale = calculateWorldFitScale(390, 844, 1621, false);
  assert.equal(scale, 844 / 1621);
  assert.ok(1080 * scale >= 390);
});
