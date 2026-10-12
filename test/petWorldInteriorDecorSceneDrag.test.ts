import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragScenePercentage } from "../client/src/lib/coordinateContracts";

const source = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");

test("interior decor drag follows background image width, not viewport width", () => {
  assert.match(source, /const bgW = bgNaturalSizeRef\.current/);
  assert.match(source, /worldCameraPointerDelta\(/);
  assert.match(source, /x: doorDecorDragRef\.current\.origPosX/);
  assert.match(source, /\{ width: bgW, height: camera\.clientHeight \}/);
  assert.match(source, /doorDecorDragLivePosRef\.current = \{ x: newX, y: newY \}/);
});

test("interior decor percentage placement is invariant across scaled images", () => {
  const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  for (const [width, height] of [[700, 500], [1400, 1000], [2100, 1500]]) {
    const result = dragScenePercentage({ x: 25, y: 65 }, { x: width * .2, y: -height * .1 }, { width, height }, bounds);
    assert.ok(Math.abs(result.x - 45) < 1e-9);
    assert.ok(Math.abs(result.y - 55) < 1e-9);
  }
});


test("door decor image plane uses live camera height and resizes with the viewport", () => {
  assert.match(source, /const height = camera\.clientHeight/);
  assert.match(source, /observer\.observe\(camera\)/);
  assert.match(source, /setBgRenderedW\(nat && nat\.h > 0 && height > 0 \? \(nat\.w \/ nat\.h\) \* height : 0\)/);
  assert.match(source, /const height = interiorRef\.current\?\.clientHeight \?\? 0/);
  assert.doesNotMatch(source, /setBgRenderedW\([^\n]*FRAME_H/);
});
