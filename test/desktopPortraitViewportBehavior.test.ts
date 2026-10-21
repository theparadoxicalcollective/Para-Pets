import assert from "node:assert/strict";
import test from "node:test";
import { calculateStageLayout } from "../client/src/lib/stage";
import { desktopPortraitGameplayLayout } from "../client/src/lib/stageViewport";

/**
 * Execute the actual desktop layout function rather than matching its source.
 * No DOM or production data is required for these pure geometry contracts.
 */
function native(width: number, height: number, left = 0, top = 0) {
  return calculateStageLayout(width, height, top, left, { viewportSurface: true });
}

test("desktop portrait gameplay uses native pixels and is centered within wide viewports", () => {
  for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768]] as const) {
    const result = desktopPortraitGameplayLayout(native(width, height), "/map", false);
    const expectedWidth = Math.min(width, Math.round(height * 0.72));
    assert.equal(result.coordinateOwner, "viewport");
    assert.equal(result.referencePortrait, false);
    assert.equal(result.scale, 1);
    assert.equal(result.designWidth, expectedWidth);
    assert.equal(result.renderedWidth, expectedWidth);
    assert.equal(result.designHeight, height);
    assert.equal(result.renderedHeight, height);
    assert.equal(result.left, (width - expectedWidth) / 2);
  }
});

test("touch-first tablets and wide phones never enter desktop portrait mode", () => {
  for (const [width, height] of [[1440, 900], [1194, 834], [1024, 768]] as const) {
    const input = native(width, height);
    assert.deepEqual(desktopPortraitGameplayLayout(input, "/", true), input);
  }
});

test("narrow, portrait and document routes retain their original viewport geometry", () => {
  const cases = [
    { width: 390, height: 844, route: "/" },
    { width: 834, height: 1194, route: "/pet-level-up/pet-1" },
    { width: 1000, height: 700, route: "/map" },
    { width: 1440, height: 900, route: "/privacy" },
  ];
  for (const { width, height, route } of cases) {
    const input = native(width, height);
    assert.deepEqual(desktopPortraitGameplayLayout(input, route, false), input, route);
  }
});

test("desktop centering preserves an existing viewport offset", () => {
  const input = native(1440, 900, 20, 10);
  const result = desktopPortraitGameplayLayout(input, "/map", false);
  assert.equal(result.left, 20 + (1440 - Math.round(900 * 0.72)) / 2);
  assert.equal(result.top, input.top);
  assert.equal(result.viewportWidth, input.viewportWidth);
  assert.equal(result.viewportHeight, input.viewportHeight);
});

test("pre-game auth and loading use the full desktop viewport rather than portrait gameplay offset", () => {
  for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    const layout = native(width, height);
    const auth = desktopPortraitGameplayLayout(layout, "/auth", false);
    assert.deepEqual(auth, layout);
    assert.equal(auth.left, 0);
    assert.equal(auth.designWidth, width);
    assert.equal(auth.renderedWidth, width);
    const gameplay = desktopPortraitGameplayLayout(layout, "/map", false);
    assert.ok(gameplay.left > 0, "authenticated gameplay must still be centered");
    assert.ok(gameplay.designWidth < width, "authenticated gameplay remains portrait");
  }
});
