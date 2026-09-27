import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, clampWorldMapOffset, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("a narrow phone fills its height while the authored sides remain pannable", () => {
  const frameW = 390;
  const frameH = 844;
  const mapH = 1440;
  const scale = calculateWorldFitScale(frameW, frameH, mapH, false);
  assert.equal(scale, frameH / mapH);
  assert.ok(WORLD_MAP_WIDTH * scale > frameW);
  const left = clampWorldMapOffset(-10000, 0, scale, frameW, frameH, mapH);
  const right = clampWorldMapOffset(10000, 0, scale, frameW, frameH, mapH);
  assert.equal(left.x + WORLD_MAP_WIDTH * scale, frameW);
  assert.equal(right.x, 0);
});

test("a wide frame fills its width and allows vertical panning", () => {
  const frameW = 1440;
  const frameH = 900;
  const mapH = 1440;
  const scale = calculateWorldFitScale(frameW, frameH, mapH, false);
  assert.equal(scale, frameW / WORLD_MAP_WIDTH);
  const top = clampWorldMapOffset(0, 10000, scale, frameW, frameH, mapH);
  const bottom = clampWorldMapOffset(0, -10000, scale, frameW, frameH, mapH);
  assert.equal(top.y, 0);
  assert.equal(bottom.y + mapH * scale, frameH);
});

test("invalid dimensions fall back safely", () => {
  assert.equal(calculateWorldFitScale(390, 0, 1440, false), 1);
  assert.equal(calculateWorldFitScale(0, 844, 1440, false), 1);
  assert.ok(calculateWorldFitScale(390, 844, 0, false) > 0);
});
