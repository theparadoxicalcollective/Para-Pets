import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");

test("main map opts into device viewport instead of legacy reference stage", () => {
  assert.equal(usesDeviceGameplaySurface("/map"), true);
  assert.match(app, /location === "\/map" && \(\s*<StagePageSurface layout="viewport">/);
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: usesDeviceGameplaySurface("/map") });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("map keeps scene-relative admin world positioning and scroll camera", () => {
  assert.match(map, /dragScenePercentage\(/);
  assert.match(map, /data-testid="world-map-viewport-camera"/);
  assert.match(map, /<ViewportScenePortal>/);
});
