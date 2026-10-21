import assert from "node:assert/strict";
import test from "node:test";
import { calculateStageLayout } from "../client/src/lib/stage";
import { desktopPortraitGameplayLayout } from "../client/src/lib/stageViewport";

test("root viewport geometry never inherits the legacy reference dimensions", () => {
  for (const [width, height] of [
    [360, 760], [390, 844], [412, 915], [768, 1024],
    [834, 1194], [1024, 1366], [1440, 900], [1920, 1080],
  ] as const) {
    const root = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(root.designWidth, width);
    assert.equal(root.designHeight, height);
    assert.equal(root.coordinateOwner, "viewport");
    assert.equal(root.referencePortrait, false);
    assert.equal(root.scale, 1);
    assert.equal(root.renderedWidth, width);
    assert.equal(root.renderedHeight, height);
  }
});

test("touch devices never receive desktop portrait reference sizing", () => {
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]] as const) {
    const root = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.deepEqual(desktopPortraitGameplayLayout(root, "/map", true), root);
  }
});

test("desktop gameplay portrait layout remains native pixel geometry, not scaled phone geometry", () => {
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    const root = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    const portrait = desktopPortraitGameplayLayout(root, "/map", false);
    const expectedWidth = Math.min(width, Math.round(height * 0.72));
    assert.equal(portrait.designWidth, expectedWidth);
    assert.equal(portrait.renderedWidth, expectedWidth);
    assert.equal(portrait.designHeight, height);
    assert.equal(portrait.renderedHeight, height);
    assert.equal(portrait.left, (width - expectedWidth) / 2);
    assert.equal(portrait.scale, 1);
    assert.equal(portrait.coordinateOwner, "viewport");
    assert.equal(portrait.referencePortrait, false);
  }
});

test("desktop portrait treatment never changes document pages", () => {
  const root = calculateStageLayout(1440, 900, 0, 0, { viewportSurface: true });
  for (const route of ["/hub", "/auth", "/privacy", "/admin", "/forum"]) {
    assert.deepEqual(desktopPortraitGameplayLayout(root, route, false), root, route);
  }
});
