import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("pet rarity stars and nameplate follow measured scene and shared admin anchor", () => {
  assert.match(home, /top: Math\.max\(210, activePetSceneRect\.top \+ activePetSceneRect\.height \* 0\.32\)/);
  assert.match(home, /activePetGroundViewport\.y \+ Math\.max\(80, activePetSceneRect\.height \* 0\.2\)/);
  assert.match(home, /petChromeAnchorOffset\(activePetAnchorQuery\.anchor, activePetSceneRect\.width\)/);
  assert.match(home, /activePetChromeOffset\.x/);
  assert.match(home, /activePetChromeOffset\.y/);
});

test("pet menu uses native HUD corner and matching circular navigation treatment", () => {
  assert.match(home, /<ViewportHudPortal>/);
  assert.match(home, /data-testid="active-pet-side-menu"/);
  assert.match(home, /h-\[56px\] w-\[56px\]/);
  assert.match(home, /width=\{58\}/);
  assert.match(home, /height=\{58\}/);
  assert.equal((home.match(/relative flex h-\[48px\] w-\[48px\]/g) || []).length, 4);
  assert.match(home, /border-\[#d4a017\]\/70/);
  assert.match(nav, /const BUTTON_SIZE = 58/);
  assert.doesNotMatch(home, /getStageScale\(|clientToStage\(|DESIGN_W|DESIGN_H/);
});
