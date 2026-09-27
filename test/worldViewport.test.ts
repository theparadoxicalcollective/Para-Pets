import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("a narrow phone keeps both sides of the haunted world visible", () => {
  const scale = calculateWorldFitScale(390, 844, 1440, false);
  assert.equal(scale, 390 / WORLD_MAP_WIDTH);
  assert.equal(WORLD_MAP_WIDTH * scale, 390);
  assert.ok(1440 * scale <= 844);
});

test("a wide frame fits the complete world height", () => {
  const scale = calculateWorldFitScale(1440, 900, 1440, false);
  assert.equal(scale, 900 / 1440);
  assert.ok(WORLD_MAP_WIDTH * scale <= 1440);
});

test("invalid dimensions fall back safely", () => {
  assert.equal(calculateWorldFitScale(390, 0, 1440, false), 1);
  assert.equal(calculateWorldFitScale(0, 844, 1440, false), 1);
  assert.ok(calculateWorldFitScale(390, 844, 0, false) > 0);
});
