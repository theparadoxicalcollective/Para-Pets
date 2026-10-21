import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const entry = readFileSync("client/src/RootEntry.tsx", "utf8");

test("loading, sign-in and verification share native viewport root ownership", () => {
  assert.match(entry, /function RootStage/);
  assert.match(entry, /useStageViewportLayout\("\/auth"\)/);
  assert.match(entry, /data-coordinate-owner="viewport"/);
  assert.match(entry, /data-reference-portrait="false"/);
  assert.doesNotMatch(entry, /root-stage-reference-plane/);
  assert.doesNotMatch(entry, /getStageTransform/);
});

test("native entry route geometry is device-sized without portrait scaling", () => {
  assert.equal(usesDeviceGameplaySurface("/"), true);
  for (const [width, height] of [[360, 760], [390, 844], [412, 915], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true, fitPortraitReference: false });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.referencePortrait, false);
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("root entry preserves auth gate, email verification and orientation blocker", () => {
  assert.match(entry, /<LoadingScreen label="Loading…"/);
  assert.match(entry, /<AuthPage \/>/);
  assert.match(entry, /<EmailGateScreen email=\{user\.email\}/);
  assert.match(entry, /<PortraitOrientationBlocker visible=\{layout\.touchPortraitBlocked\}/);
});
