import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const evolution = readFileSync("client/src/components/powerup/PowerUpEvolutionPanel.tsx", "utf8");

test("Power Up does not place a full-screen interactive portal above its main controls", () => {
  assert.doesNotMatch(power, /ViewportModalPortal/);
  assert.doesNotMatch(power, /#game-viewport-hud \.pupage-close/);
});

test("pet stats, evolution nodes, and item drags remain interactive on the page surface", () => {
  assert.match(power, /data-testid="zone-pet-drop"[\s\S]*onClick=\{openStats\}/);
  assert.match(power, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(power, /onPointerMove=\{onPointerMove\}/);
  assert.match(power, /onPointerUp=\{onPointerUp\}/);
  assert.match(evolution, /data-testid=\{`button-evolution-slot-\$\{slot\}`\}/);
  assert.match(evolution, /if \(current\) setPickerOpen\(true\)/);
});
