import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");
const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");

test("viewport modal portal can host edge controls without blocking the page below", () => {
  assert.match(portal, /blocking = true/);
  assert.match(portal, /pointerEvents: blocking \? "auto" : "none"/);
});

test("Power Up close control uses a nonblocking viewport wrapper", () => {
  assert.match(power, /<ViewportModalPortal blocking=\{false\}>[\s\S]*data-testid="button-close-powerup-modal"/);
  assert.match(power, /#game-viewport-hud \.pupage-close\{[^}]*pointer-events:auto/);
});

test("Power Up gameplay controls remain on the underlying interactive page", () => {
  assert.match(power, /data-testid="zone-pet-drop"[\s\S]*onClick=\{openStats\}/);
  assert.match(power, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(power, /onPointerMove=\{onPointerMove\}/);
  assert.match(power, /onPointerUp=\{onPointerUp\}/);
});
