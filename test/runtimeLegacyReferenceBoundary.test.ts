import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout } from "../client/src/lib/stage";
import { desktopPortraitGameplayLayout } from "../client/src/lib/stageViewport";

const read = (path: string) => readFileSync(path, "utf8");

test("runtime viewport observer explicitly owns device geometry, not reference fit", () => {
  const source = read("client/src/lib/stageViewport.ts");
  assert.match(source, /const viewportSurface = true/);
  assert.match(source, /calculateStageLayout\([\s\S]*?\{ viewportSurface \}/);
  assert.doesNotMatch(source, /calculateMiniGamePage\(|calculateMiniGameScale\(|shouldFitPortraitReference\(/);
});

test("active game and pre-game roots never request reference-stage scaling", () => {
  for (const file of ["client/src/App.tsx", "client/src/RootEntry.tsx"]) {
    const source = read(file);
    assert.match(source, /data-coordinate-owner="viewport"/);
    assert.match(source, /data-reference-portrait="false"/);
    assert.doesNotMatch(source, /fitPortraitReference|calculateMiniGamePage\(|calculateMiniGameScale\(/);
  }
});

test("shared mini-game frame does not call legacy 390x844 sizing helpers", () => {
  const source = read("client/src/components/world/MiniGameFrame.tsx");
  assert.match(source, /<ViewportScenePortal>/);
  assert.match(source, /data-camera-mode="device-viewport"/);
  assert.doesNotMatch(source, /calculateMiniGamePage|calculateMiniGameScale|usesNativeMiniGamePage|DESIGN_W|DESIGN_H/);
});

test("legacy reference geometry is opt-in and does not constrain native viewport calculations", () => {
  for (const [width, height] of [[320, 568], [390, 844], [412, 915], [834, 1194], [1440, 900]] as const) {
    const native = calculateStageLayout(width, height, 0, 0, { viewportSurface: true, fitPortraitReference: true });
    assert.equal(native.designWidth, width);
    assert.equal(native.designHeight, height);
    assert.equal(native.coordinateOwner, "viewport");
    assert.equal(native.referencePortrait, false);
    assert.equal(native.scale, 1);
  }
  const desktop = desktopPortraitGameplayLayout(calculateStageLayout(1920, 1080, 0, 0, { viewportSurface: true }), "/map", false);
  assert.equal(desktop.designWidth, Math.round(1080 * 0.72));
  assert.equal(desktop.scale, 1);
  assert.equal(desktop.referencePortrait, false);
});
