import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("world maps always match the viewport height exactly", () => {
  const cases = [
    { frameW: 390, frameH: 844 },
    { frameW: 768, frameH: 1024 },
    { frameW: 1440, frameH: 900 },
  ];

  for (const { frameW, frameH } of cases) {
    const scale = calculateWorldFitScale(frameW, frameH, WORLD_MAP_HEIGHT, false);
    assert.equal(scale, frameH / WORLD_MAP_HEIGHT);
    assert.ok(Math.abs(WORLD_MAP_HEIGHT * scale - frameH) < 0.000001);
  }
});

test("narrow portrait viewports may overflow horizontally instead of shrinking the map", () => {
  const frameW = 390;
  const frameH = 844;
  const scale = calculateWorldFitScale(frameW, frameH, WORLD_MAP_HEIGHT, false);
  assert.ok(WORLD_MAP_WIDTH * scale > frameW);
});

test("viewport width no longer changes world zoom level", () => {
  const narrow = calculateWorldFitScale(390, 844, WORLD_MAP_HEIGHT, false);
  const wide = calculateWorldFitScale(1200, 844, WORLD_MAP_HEIGHT, false);
  assert.equal(narrow, wide);
});

test("per-world map height controls height-fit scaling", () => {
  const frameH = 844;
  const shortMapHeight = 1440;
  const tallMapHeight = 2400;
  const shortScale = calculateWorldFitScale(390, frameH, shortMapHeight, false);
  const tallScale = calculateWorldFitScale(390, frameH, tallMapHeight, false);

  assert.equal(shortScale, frameH / shortMapHeight);
  assert.equal(tallScale, frameH / tallMapHeight);
  assert.notEqual(shortScale, tallScale);
  assert.ok(Math.abs(shortMapHeight * shortScale - frameH) < 0.000001);
  assert.ok(Math.abs(tallMapHeight * tallScale - frameH) < 0.000001);
});

test("invalid viewport height fails safely", () => {
  assert.equal(calculateWorldFitScale(390, 0, WORLD_MAP_HEIGHT, false), 1);
});
