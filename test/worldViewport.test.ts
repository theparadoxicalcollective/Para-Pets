import assert from "node:assert/strict";
import test from "node:test";
import { calculateExpandedWorldCameraPanMargin, calculateExpandedWorldCameraScale, calculateWorldFitScale, clampWorldMapOffset, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

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


test("expanded tablet camera preserves a meaningful draggable margin around the real map", () => {
  const mapH = 1440;
  const phoneScale = calculateExpandedWorldCameraScale(390, 844, mapH);
  assert.equal(phoneScale, 844 / mapH);

  const frameW = 683;
  const frameH = 911;
  const margin = calculateExpandedWorldCameraPanMargin(frameW, frameH);
  const tabletScale = calculateExpandedWorldCameraScale(frameW, frameH, mapH);

  assert.equal(margin, Math.min(72, Math.min(frameW, frameH) * 0.06));
  assert.ok(tabletScale >= phoneScale);
  assert.ok(WORLD_MAP_WIDTH * tabletScale >= frameW + margin * 2 - 1e-9);
  assert.ok(mapH * tabletScale >= frameH + margin * 2 - 1e-9);

  const first = clampWorldMapOffset(9999, 9999, tabletScale, frameW, frameH, mapH);
  const last = clampWorldMapOffset(-9999, -9999, tabletScale, frameW, frameH, mapH);
  assert.equal(first.x, 0);
  assert.equal(first.y, 0);
  assert.ok(Math.abs(last.x + WORLD_MAP_WIDTH * tabletScale - frameW) < 1e-9);
  assert.ok(Math.abs(last.y + mapH * tabletScale - frameH) < 1e-9);
  assert.ok(-last.x >= margin * 2 - 1e-9);
  assert.ok(-last.y >= margin * 2 - 1e-9);
});

test("expanded desktop camera keeps real map beyond the horizontal edges while preserving vertical exploration", () => {
  const mapH = 1440;
  const frameW = 1500;
  const frameH = 844;
  const referenceScale = 844 / mapH;
  const margin = calculateExpandedWorldCameraPanMargin(frameW, frameH);
  const desktopScale = calculateExpandedWorldCameraScale(frameW, frameH, mapH);

  assert.ok(desktopScale >= referenceScale);
  assert.ok(WORLD_MAP_WIDTH * desktopScale >= frameW + margin * 2 - 1e-9);
  assert.ok(mapH * desktopScale >= frameH + margin * 2 - 1e-9);

  const topLeft = clampWorldMapOffset(9999, 9999, desktopScale, frameW, frameH, mapH);
  const bottomRight = clampWorldMapOffset(-9999, -9999, desktopScale, frameW, frameH, mapH);
  assert.equal(topLeft.x, 0);
  assert.equal(topLeft.y, 0);
  assert.ok(Math.abs(bottomRight.x + WORLD_MAP_WIDTH * desktopScale - frameW) < 1e-9);
  assert.ok(Math.abs(bottomRight.y + mapH * desktopScale - frameH) < 1e-9);
});


test("reference-sized cameras keep the exact iPhone 12 World composition", () => {
  for (const mapH of [1440, 1600, 1920, 2160]) {
    assert.equal(
      calculateExpandedWorldCameraScale(390, 844, mapH),
      calculateWorldFitScale(390, 844, mapH, false),
    );
  }
});

test("expanded camera pan margin is bounded on very large displays", () => {
  assert.equal(calculateExpandedWorldCameraPanMargin(3000, 2000), 72);
  assert.equal(calculateExpandedWorldCameraPanMargin(0, 844), 0);
});
