import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("pet rarity stars and nameplate follow measured scene and shared admin anchor", () => {
  assert.match(home, /top: "-20%", left: "50%"/);
  assert.match(home, /\(activePetGroundViewport\?\.y \?\? \(activePetSceneRect\.top \+ activePetSceneRect\.height\)\) \+ Math\.max\(80, activePetSceneRect\.height \* 0\.2\)/);
  assert.match(home, /petChromeAnchorOffset\(activePetAnchorQuery\.anchor, activePetSceneRect\.width\)/);
  assert.match(home, /activePetChromeOffset\.x/);
  assert.match(home, /activePetChromeOffset\.y/);
});

test("pet menu stays in native HUD corner with unframed icon buttons", () => {
  assert.match(home, /<ViewportHudPortal>/);
  assert.match(home, /data-testid="active-pet-side-menu"/);
  assert.match(home, /h-\[56px\] w-\[56px\]/);
  assert.match(home, /width=\{58\}/);
  assert.match(home, /height=\{58\}/);
  assert.equal((home.match(/relative flex h-\[48px\] w-\[48px\]/g) || []).length, 4);
  const petMenu = home.slice(home.indexOf("{/* Screen-relative Pet Menu:"), home.indexOf("{/* Daily quest hints follow"));
  assert.equal((petMenu.match(/border-0 bg-transparent p-0/g) || []).length, 5);
  assert.doesNotMatch(petMenu, /border-2|bg-\[#142819\]|shadow-\[/);
  assert.match(nav, /const BUTTON_SIZE = 58/);
  assert.doesNotMatch(home, /getStageScale\(|clientToStage\(|DESIGN_W|DESIGN_H/);
});
