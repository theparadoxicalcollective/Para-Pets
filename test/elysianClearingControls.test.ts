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

test("Elysian Clearing uses a compact responsive pet and expanded movement bounds", () => {
  assert.match(pageSource, /petSize: 96/);
  assert.match(pageSource, /responsivePet: \{ min: 86, preferredVw: 24, max: 108 \}/);
  assert.match(pageSource, /xMin: 0\.08[\s\S]*xMax: 0\.92[\s\S]*yMin: 0\.05[\s\S]*yMax: 0\.94/);
  assert.match(sceneSource, /const DEFAULT_PET_SIZE = 110/);
  assert.match(sceneSource, /responsivePet \? clearingPetSize\(viewport\)/);
});

test("Clearing offers three health-or-mana potion slots and a world-return defeat dialog", () => {
  const combatSource = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
  const potionSource = readFileSync("client/src/lib/clearingPotionSlots.ts", "utf8");
  assert.match(combatSource, /data-testid="clearing-potion-slots"/);
  assert.match(combatSource, /\[0,1,2\]\.map/);
  assert.match(potionSource, /Number\(item\.petsRevived\|\|0\)===0/);
  assert.match(potionSource, /Math\.min\(50/);
  assert.match(combatSource, /usingPotionRef\.current/);
  assert.match(combatSource, /data-testid="button-clearing-defeat-return"/);
  assert.match(combatSource, /onReturnToWorld/);
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
  assert.match(sceneSource, /onLostPointerCapture=\{onJoystickPointerUp\}/);
  assert.match(sceneSource, /closest\("button, a, input, select, textarea, \[data-interactive\]"\)/);
  assert.match(sceneSource, /touchAction: "none"/);
  assert.match(controllerSource, /setPointerCapture\(e\.pointerId\)/);
  assert.match(controllerSource, /rawDx \/ Math\.max\(dist, MAX_JOY_RADIUS\)/);
  assert.match(controllerSource, /joyActiveRef\.current = false[\s\S]*dirRef\.current = \{ dx: 0, dy: 0 \}/);
});

test("Clearing controls use CSS-only art and stop on browser interruption", () => {
  assert.doesNotMatch(sceneSource, /joystick_base\.png|joystick_thumb_v3\.png/);
  assert.match(sceneSource, /data-testid="joystick-base"/);
  assert.doesNotMatch(sceneSource.slice(sceneSource.indexOf('data-testid="floating-joystick"')), /<img[^>]+joystick/);
  assert.match(controllerSource, /window\.addEventListener\("blur", stopMovement\)/);
  assert.match(controllerSource, /document\.addEventListener\("visibilitychange", onVisibility\)/);
});

test("the camera has one transformed world layer and a separate fixed HUD", () => {
  assert.match(pageSource, /worldSize: \{ width: 1, height: 1 \}/);
  assert.match(pageSource, /aspectLayout: \{ imageAspect: 2886 \/ 4331/);
  assert.match(sceneSource, /data-testid="walkaround-world-layer"/);
  assert.match(sceneSource, /translate3d/);
  assert.match(sceneSource, /data-testid="walkaround-hud-layer"/);
});

test("only the Clearing hides its scene title and its currency row stays safe-area aware",()=>{
  const combatSource=readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
  assert.match(pageSource,/showSceneTitle: false/);
  assert.match(sceneSource,/config\.showSceneTitle!==false/);
  assert.match(sceneSource,/data-testid="walkaround-scene-title"/);
  assert.match(combatSource,/--clearing-hud-top-row/);
  assert.match(combatSource,/env\(safe-area-inset-top/);
  assert.doesNotMatch(combatSource,/safe-area-inset-top, 0px\) \+ 58px/);
});

test("Clearing equipped weapon pointer is world-space and cannot intercept controls", () => {
  const combatSource=readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
  const effectSource=readFileSync("client/src/components/ClearingAttackEffect.tsx","utf8");
  assert.match(controllerSource,/aimDirection/);assert.match(controllerSource,/persistentAimDirection/);
  assert.match(sceneSource,/aimDirection=\{aimDirection\}/);
  assert.doesNotMatch(combatSource,/data-testid="clearing-aim-pointer"/);assert.match(effectSource,/data-testid="clearing-equipped-weapon-pointer"[^>]*[\s\S]*pointer-events-none/);
  assert.match(combatSource,/lockedStaff/);assert.match(combatSource,/selectFirstEnemyAlongAimCapsule/);
  assert.match(combatSource,/data-testid="button-clearing-attack"[\s\S]*pointer-events-auto/);
});
