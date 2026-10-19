import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateStageLayout, getStageTransform } from "../client/src/lib/stage";

test("native root surface occupies the measured viewport on phone, tablet, and desktop", () => {
  for (const [width, height] of [
    [320, 568], [360, 740], [390, 844], [430, 932],
    [768, 1024], [1024, 768], [1440, 900], [1920, 1080],
  ]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport", `${width}x${height}`);
    assert.equal(layout.referencePortrait, false);
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.viewportWidth, width);
    assert.equal(layout.viewportHeight, height);
    assert.equal(layout.renderedWidth, width);
    assert.equal(layout.renderedHeight, height);
    assert.equal(layout.scale, 1);
    assert.equal(layout.left, 0);
    assert.equal(layout.top, 0);
    assert.equal(getStageTransform(layout), undefined);
  }
});

test("browser visual-viewport offsets remain offsets, not a centered phone plane", () => {
  const layout = calculateStageLayout(1024, 768, 17, 9, { viewportSurface: true });
  assert.equal(layout.left, 9);
  assert.equal(layout.top, 17);
  assert.equal(layout.designWidth, 1024);
  assert.equal(layout.designHeight, 768);
  assert.equal(layout.scale, 1);
});

test("native root ignores the legacy portrait-fit option even when both are provided", () => {
  const layout = calculateStageLayout(820, 1180, 0, 0, {
    viewportSurface: true,
    fitPortraitReference: true,
  });
  assert.equal(layout.coordinateOwner, "viewport");
  assert.equal(layout.referencePortrait, false);
  assert.equal(layout.designWidth, 820);
  assert.equal(layout.designHeight, 1180);
  assert.equal(layout.scale, 1);
});

test("viewport root does not reintroduce a scaled iPhone stage in its runtime owner", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const viewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");
  assert.match(viewport, /const viewportSurface = true/);
  assert.doesNotMatch(app, /getStageTransform\\(layout\\)|layout\\.coordinateOwner === "stage"/);
  assert.match(app, /data-coordinate-owner="viewport"/);
  assert.match(app, /id="game-viewport-hud"/);
  assert.match(app, /id="game-viewport-scene"/);
});
