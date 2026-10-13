import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const molten = readFileSync("client/src/pages/MoltenBlocksPage.tsx", "utf8");
const frame = readFileSync("client/src/components/world/MiniGameFrame.tsx", "utf8");

test("Molten Blocks uses device viewport rather than 390x844 reference stage", () => {
  assert.equal(usesDeviceGameplaySurface("/games/molten-blocks"), true);
  assert.ok(app.includes(`location === "/games/molten-blocks" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Molten Blocks preserves game canvas, controls and existing full-screen camera", () => {
  assert.match(frame, /data-camera-mode="device-viewport"/);
  assert.match(frame, /<ViewportScenePortal>/);
  assert.match(molten, /data-testid="canvas-board"/);
  assert.match(molten, /data-testid="button-pause"/);
  assert.match(molten, /data-testid="button-hold"/);
});
