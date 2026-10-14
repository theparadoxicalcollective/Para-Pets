import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guide = readFileSync("client/src/lib/questGuideViewport.ts", "utf8");
const lonelle = readFileSync("client/src/components/LonelleQuestOverlay.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("pet menu quest guide follows actual HUD geometry rather than root reference plane", () => {
  assert.match(guide, /anchor\.closest\("#game-viewport-hud"\)/);
  assert.match(guide, /hudOwner \?\? document\.getElementById\("game-viewport-hud"\)/);
  assert.match(guide, /target\.getBoundingClientRect\(\)/);
  assert.match(guide, /rect\.width \/ Math\.max\(1, logicalWidth\)/);
});

test("Lonelle guide tracks the current pet menu button and closet icon target", () => {
  assert.match(lonelle, /button-open-pet-menu/);
  assert.match(lonelle, /button-action-equip-accessories/);
  assert.match(home, /data-testid="active-pet-side-menu"/);
  for (const asset of ["Pet Menu.png", "ClosetIcon.png", "PowerUpIcon.png", "LevelUpIcon.png", "PetCareIcon.png"]) {
    assert.ok(home.includes(asset), asset);
  }
});
