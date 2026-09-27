import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "../client/src/lib/worldViewport";

test("browser and installed modes fill the viewport with the same map scale", () => {
  for (const fitFullComposition of [true, false]) {
    const frameW = 390;
    const frameH = 760;
    const scale = calculateWorldFitScale(frameW, frameH, WORLD_MAP_HEIGHT, fitFullComposition);
    assert.ok(WORLD_MAP_WIDTH * scale >= frameW);
    assert.ok(WORLD_MAP_HEIGHT * scale >= frameH);
  }
});

test("display mode does not change admin-authored map coordinates", () => {
  assert.equal(
    calculateWorldFitScale(390, 760, WORLD_MAP_HEIGHT, true),
    calculateWorldFitScale(390, 760, WORLD_MAP_HEIGHT, false),
  );
});
