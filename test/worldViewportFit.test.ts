import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("phone browser fits the full world height and permits horizontal overflow", () => {
  const frameW = 390;
  const frameH = 760;
  const scale = calculateWorldFitScale(frameW, frameH, WORLD_MAP_HEIGHT, true);
  assert.equal(scale, frameH / WORLD_MAP_HEIGHT);
  assert.ok(Math.abs(WORLD_MAP_HEIGHT * scale - frameH) < 0.000001);
  assert.ok(WORLD_MAP_WIDTH * scale > frameW);
});

test("standalone portrait view keeps the full vertical composition visible", () => {
  const frameW = 390;
  const frameH = 844;
  const scale = calculateWorldFitScale(frameW, frameH, WORLD_MAP_HEIGHT, false);
  assert.ok(Math.abs(WORLD_MAP_HEIGHT * scale - frameH) < 0.000001);
  assert.ok(WORLD_MAP_WIDTH * scale > frameW);
});

test("browser display mode does not change height-fit scaling", () => {
  const browser = calculateWorldFitScale(390, 760, WORLD_MAP_HEIGHT, true);
  const installed = calculateWorldFitScale(390, 760, WORLD_MAP_HEIGHT, false);
  assert.equal(browser, installed);
});
