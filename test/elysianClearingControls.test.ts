import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const pageSource = readFileSync("client/src/pages/ElysianBayouClearingPage.tsx", "utf8");
const sceneSource = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
const controllerSource = readFileSync("client/src/hooks/usePetWalkController.ts", "utf8");

test("only the Elysian Clearing exploration route joins the existing nav exclusions", () => {
  assert.match(appSource, /NAV_HIDDEN_PATHS = \[[^\]]*"\/explore\/elysian-bayou-clearing"/);
  assert.doesNotMatch(appSource, /path\.startsWith\("\/explore\/"\)/);
});

test("Elysian Clearing modestly increases its pet without changing movement bounds", () => {
  assert.match(pageSource, /petSize: 124/);
  assert.match(pageSource, /xMin: 0\.18[\s\S]*xMax: 0\.82[\s\S]*yMin: 0\.08[\s\S]*yMax: 0\.90/);
  assert.match(sceneSource, /const DEFAULT_PET_SIZE = 110/);
});

test("pet direction is flipped relative to each template's natural facing", () => {
  assert.match(sceneSource, /petTemplate\?\.facing === "left" \|\| petTemplate\?\.facing === "back"/);
  assert.match(sceneSource, /facingLeft !== naturalFacingLeft \? -1 : 1/);
  assert.match(controllerSource, /if \(dx < 0[^\n]*setFacingLeft\(true\)/);
  assert.match(controllerSource, /if \(dx > 0[^\n]*setFacingLeft\(false\)/);
});

test("floating joystick uses pointer capture, edge clamping, and safe cancellation", () => {
  assert.match(sceneSource, /\{isJoystickActive && <div/);
  assert.match(sceneSource, /Math\.max\(radius \+ JOYSTICK_EDGE_GAP/);
  assert.match(sceneSource, /onPointerCancel=\{onJoystickPointerUp\}/);
  assert.match(sceneSource, /onPointerLeave=\{onJoystickPointerUp\}/);
  assert.match(sceneSource, /closest\("button, a, input, select, textarea, \[data-interactive\]"\)/);
  assert.match(sceneSource, /touchAction: "none"/);
  assert.match(controllerSource, /setPointerCapture\(e\.pointerId\)/);
  assert.match(controllerSource, /rawDx \/ Math\.max\(dist, MAX_JOY_RADIUS\)/);
  assert.match(controllerSource, /joyActiveRef\.current = false[\s\S]*dirRef\.current = \{ dx: 0, dy: 0 \}/);
});
