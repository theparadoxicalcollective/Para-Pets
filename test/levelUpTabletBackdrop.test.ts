import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const levelUp = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("Level Up paints one continuous backdrop on stage-owned tablet layouts", () => {
  assert.match(levelUp, /<ViewportBackdropPortal>/);
  assert.match(levelUp, /data-testid="level-up-viewport-backdrop"/);
  assert.match(levelUp, /data-viewport-visual-owner="backdrop"/);
  assert.match(levelUp, /#game-stage\[data-coordinate-owner="stage"\] \.lupage\[data-stage-coordinate-space="canonical"\]\{background:transparent\}/);
  assert.match(levelUp, /\.lupage\[data-stage-coordinate-space="canonical"\] \.lupage-bg,#game-stage\[data-coordinate-owner="stage"\] \.lupage\[data-stage-coordinate-space="canonical"\] \.lupage-shade\{display:none\}/);
});

test("Level Up keeps canonical phone visuals and pet drop interaction", () => {
  assert.doesNotMatch(levelUp, /className="lupage-bg"/);
  assert.doesNotMatch(levelUp, /className="lupage-shade"/);
  assert.match(levelUp, /@assets\/uploads\/NewActivePetBG\.png/);
  assert.match(levelUp, /ref=\{zoneRef\}/);
  assert.match(levelUp, /data-testid="zone-levelup-pet-drop"/);
});
