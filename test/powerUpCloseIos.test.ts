import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");

test("iOS swipe suppression leaves explicit edge controls alone", () => {
  assert.match(app, /let touchStartedInIosEdgeControl = false/);
  assert.match(app, /closest\?\.\('\[data-ios-edge-control="true"\]'\)/);
  assert.match(app, /touchStartedInPetCareShelf \|\| touchStartedInIosEdgeControl/);
});

test("Power Up close control uses the top modal surface and a direct pointer path", () => {
  assert.match(power, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.match(power, /<ViewportModalPortal blocking=\{false\}>[\s\S]*data-testid="button-close-powerup-modal"[\s\S]*<\/ViewportModalPortal>/);
  assert.match(power, /data-ios-edge-control="true"/);
  assert.match(power, /onPointerDown=\{\(event\) => \{ event\.stopPropagation\(\); \}\}/);
  assert.match(power, /onPointerUp=\{\(event\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); onClose\(\); \}\}/);
  assert.match(power, /onClick=\{\(event\) => \{ if \(event\.detail === 0\) onClose\(\); \}\}/);
  assert.doesNotMatch(power, /onTouchEnd=/);
  assert.match(power, /pupage-corner\{[^}]*pointer-events:auto[^}]*touch-action:manipulation/);
});
