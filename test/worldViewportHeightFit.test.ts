import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, clampWorldMapOffset, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("worlds fill phone, tablet, and desktop while off-screen areas can be reached", () => {
  for (const { frameW, frameH, mapH } of [
    { frameW: 390, frameH: 844, mapH: 1440 },
    { frameW: 390, frameH: 760, mapH: 1980 },
    { frameW: 768, frameH: 1024, mapH: 1621 },
    { frameW: 1440, frameH: 900, mapH: 1440 },
  ]) {
    const scale = calculateWorldFitScale(frameW, frameH, mapH, false);
    assert.ok(WORLD_MAP_WIDTH * scale >= frameW - 0.001);
    assert.ok(mapH * scale >= frameH - 0.001);
    const first = clampWorldMapOffset(9999, 9999, scale, frameW, frameH, mapH);
    const last = clampWorldMapOffset(-9999, -9999, scale, frameW, frameH, mapH);
    assert.equal(first.x, 0);
    assert.equal(first.y, 0);
    assert.ok(Math.abs(last.x + WORLD_MAP_WIDTH * scale - frameW) < 0.001);
    assert.ok(Math.abs(last.y + mapH * scale - frameH) < 0.001);
  }
});

test("saved percentage positions keep their relative position on the map", () => {
  const x = 73;
  const y = 38;
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
    const scale = calculateWorldFitScale(w, h, 1440, false);
    const screenX = -40 + WORLD_MAP_WIDTH * x / 100 * scale;
    const screenY = -80 + 1440 * y / 100 * scale;
    assert.ok(Math.abs((screenX + 40) / (WORLD_MAP_WIDTH * scale) * 100 - x) < 0.000001);
    assert.ok(Math.abs((screenY + 80) / (1440 * scale) * 100 - y) < 0.000001);
  }
  assert.equal(calculateWorldFitScale(390, 0, WORLD_MAP_HEIGHT, false), 1);
});
