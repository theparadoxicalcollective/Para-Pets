import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("maps remain entirely inside phone, tablet, and desktop frames", () => {
  for (const { frameW, frameH, mapH } of [
    { frameW: 390, frameH: 844, mapH: 1440 },
    { frameW: 390, frameH: 760, mapH: 1980 },
    { frameW: 768, frameH: 1024, mapH: 1621 },
    { frameW: 1440, frameH: 900, mapH: 1440 },
  ]) {
    const scale = calculateWorldFitScale(frameW, frameH, mapH, false);
    assert.ok(WORLD_MAP_WIDTH * scale <= frameW + 0.001);
    assert.ok(mapH * scale <= frameH + 0.001);
    assert.ok(Math.abs(WORLD_MAP_WIDTH * scale - frameW) < 0.001 || Math.abs(mapH * scale - frameH) < 0.001);
  }
});

test("the full x range of saved NPC positions stays visible on a narrow phone", () => {
  const frameW = 390;
  const scale = calculateWorldFitScale(frameW, 844, 1440, false);
  const mapLeft = (frameW - WORLD_MAP_WIDTH * scale) / 2;
  for (const xPercent of [0, 25, 50, 75, 100]) {
    const renderedX = mapLeft + WORLD_MAP_WIDTH * xPercent / 100 * scale;
    assert.ok(renderedX >= 0 && renderedX <= frameW);
  }
});

test("each world's authored height controls its fit", () => {
  const shortScale = calculateWorldFitScale(1080, 844, 1440, false);
  const tallScale = calculateWorldFitScale(1080, 844, 2400, false);
  assert.equal(shortScale, 844 / 1440);
  assert.equal(tallScale, 844 / 2400);
  assert.notEqual(shortScale, tallScale);
  assert.equal(calculateWorldFitScale(390, 0, WORLD_MAP_HEIGHT, false), 1);
});
