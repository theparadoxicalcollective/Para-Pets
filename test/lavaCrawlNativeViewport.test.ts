import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const lava = readFileSync("client/src/pages/LavaCrawlPage.tsx", "utf8");
const frame = readFileSync("client/src/components/world/MiniGameFrame.tsx", "utf8");

test("Lava Crawl route uses native device viewport instead of 390x844 reference stage", () => {
  assert.equal(usesDeviceGameplaySurface("/games/lava-crawl"), true);
  assert.ok(app.includes(`location === "/games/lava-crawl" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Lava Crawl keeps size-responsive canvas, world frame and game controls", () => {
  assert.match(frame, /data-camera-mode="device-viewport"/);
  assert.match(frame, /<ViewportScenePortal>/);
  assert.match(lava, /canvas\.clientWidth/);
  assert.match(lava, /canvas\.clientHeight/);
  assert.match(lava, /data-testid="button-lava-pause"/);
  assert.match(lava, /data-testid="button-lava-jump"/);
});
