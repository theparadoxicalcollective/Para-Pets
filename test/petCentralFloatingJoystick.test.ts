import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const world = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");
const clearing = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");

test("Pet Central joystick floats at touch origin like Clearing without a global stage scale", () => {
  assert.match(clearing, /data-testid="floating-joystick"/);
  assert.match(world, /data-testid="floating-joystick"/);
  assert.match(world, /data-testid="pet-central-joystick-zone"/);
  assert.match(world, /getBoundingClientRect\(\)/);
  assert.match(world, /e\.clientX - rect\.left/);
  assert.match(world, /e\.clientY - rect\.top/);
  assert.match(world, /onLostPointerCapture=\{e => release\(e\.pointerId\)\}/);
  assert.match(world, /onPointerCancel=\{e => release\(e\.pointerId\)\}/);
  assert.match(world, /pointerEvents: "auto", touchAction: "none"/);
});

test("Pet Central retains existing movement controller with Clearing-style visuals", () => {
  assert.match(world, /onChange\(dx \/ maxDist, dy \/ maxDist, true\)/);
  assert.match(world, /onChange\(0, 0, false\)/);
  assert.match(world, /<Joystick onChange=\{handleJoystickChange\} \/>/);
  assert.match(world, /joystickDirRef\.current = \{ dx, dy \}/);
  assert.doesNotMatch(world, /joystickBaseImg|joystickThumbImg/);
  assert.match(world, /data-testid="joystick-base"/);
  assert.match(world, /data-testid="joystick-thumb"/);
  assert.match(world, /data-testid="pet-central-joystick-hud"/);
});
