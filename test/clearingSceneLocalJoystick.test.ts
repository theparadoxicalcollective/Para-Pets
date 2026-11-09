import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clearing = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");

test("Clearing joystick uses its own rendered scene geometry, never root stage scale", () => {
  assert.doesNotMatch(clearing, /getStageScale/);
  assert.match(clearing, /sceneRef\.current\.clientWidth/);
  assert.match(clearing, /sceneRef\.current\.clientHeight/);
  assert.match(clearing, /const scaleX = rect\.width \/ Math\.max\(1, logicalWidth\)/);
  assert.match(clearing, /const scaleY = rect\.height \/ Math\.max\(1, logicalHeight\)/);
  assert.match(clearing, /\(e\.clientX - rect\.left\) \/ scaleX/);
  assert.match(clearing, /\(e\.clientY - rect\.top\) \/ scaleY/);
  assert.match(clearing, /setJoystickCenter\(\{ x, y \}\)/);
  // Display position is scene-local and edge-clamped; movement begins at
  // the original touch point so edge gestures do not reverse direction.
  assert.match(clearing, /onJoystickPointerDown\(e, \{ x: e\.clientX, y: e\.clientY \}\)/);
  assert.match(clearing, /const pointerX = \(e\.clientX - rect\.left\) \/ scaleX/);
  assert.match(clearing, /const pointerY = \(e\.clientY - rect\.top\) \/ scaleY/);
  assert.match(clearing, /onPointerCancel=\{onJoystickPointerUp\}/);
  assert.match(clearing, /!e\.isPrimary/);
});
