import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const clearing = readFileSync("client/src/pages/ElysianBayouClearingPage.tsx", "utf8");

test("Elysian Bayou Clearing route uses device viewport rather than 390x844 reference stage", () => {
  assert.equal(usesDeviceGameplaySurface("/explore/elysian-bayou-clearing"), true);
  assert.ok(app.includes(`location === "/explore/elysian-bayou-clearing" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Clearing retains its world-relative movement, combat and viewport camera", () => {
  assert.match(clearing, /cameraMode: "device-viewport"/);
  assert.match(clearing, /<ViewportScenePortal>/);
  assert.match(clearing, /<WalkAroundScene/);
  assert.match(clearing, /walkableBounds:/);
  assert.match(clearing, /combat:\s+true/);
});
