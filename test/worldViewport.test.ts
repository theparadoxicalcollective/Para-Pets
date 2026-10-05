import assert from "node:assert/strict";
import test from "node:test";
import { calculateExpandedWorldCameraScale, calculateWorldFitScale, clampWorldMapOffset, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

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


test("expanded camera preserves the iPhone 12 world zoom while revealing more map on tablets", () => {
  const mapH = 1440;
  const phoneScale = calculateExpandedWorldCameraScale(390, 844, mapH);
  assert.equal(phoneScale, 844 / mapH);

  const tabletScale = calculateExpandedWorldCameraScale(683, 911, mapH);
  const tabletContain = Math.min(683 / WORLD_MAP_WIDTH, 911 / mapH);
  assert.equal(tabletScale, tabletContain);
  assert.ok(tabletScale >= phoneScale);

  const tabletBounds = clampWorldMapOffset(0, 0, tabletScale, 683, 911, mapH);
  assert.equal(tabletBounds.x, (683 - WORLD_MAP_WIDTH * tabletScale) / 2);
  assert.equal(tabletBounds.y, (911 - mapH * tabletScale) / 2);
});

test("expanded desktop camera never zooms a world below the iPhone 12 reference scale", () => {
  const mapH = 1440;
  const referenceScale = 844 / mapH;
  const desktopScale = calculateExpandedWorldCameraScale(1500, 844, mapH);
  assert.equal(desktopScale, referenceScale);

  const centered = clampWorldMapOffset(0, 0, desktopScale, 1500, 844, mapH);
  assert.equal(centered.x, (1500 - WORLD_MAP_WIDTH * referenceScale) / 2);
  assert.equal(centered.y, 0);
});
