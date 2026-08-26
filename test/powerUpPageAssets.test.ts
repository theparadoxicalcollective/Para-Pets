import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const powerUpSource = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const evolutionSkinSource = readFileSync("client/src/components/powerup/EvolutionPanel.tsx", "utf8");
const levelUpSource = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

const requiredPowerUpAssets = [
  "@assets/ui/power-up/background.png",
  "@assets/ui/power-up/active-pet-platform.png",
  "@assets/ui/power-up/enhancements-remaining-bar.png",
  "@assets/ui/power-up/power-up-item-bar.png",
  "@assets/ui/power-up/pet-name-level-bar.png",
  "@assets/ui/power-up/power-up-logo.png",
  "@assets/ui/power-up/close-page-icon.png",
  "@assets/ui/power-up/stat-box.png",
];

test("Power Up page uses the organized PUP artwork", () => {
  for (const asset of requiredPowerUpAssets) assert.match(powerUpSource, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(powerUpSource, /<h2[^>]*>POWER UP<\/h2>/);
  assert.match(powerUpSource, /statFilter/);
  assert.match(powerUpSource, /ChevronLeft/);
  assert.match(powerUpSource, /ChevronRight/);
});

test("Power Up evolution uses its uploaded unlocked and locked artwork", () => {
  assert.match(evolutionSkinSource, /evolution-icon-unlocked\.png/);
  assert.match(evolutionSkinSource, /evolution-icon-locked\.png/);
});

test("Level Up remains independent from Power Up PUP artwork", () => {
  assert.doesNotMatch(levelUpSource, /@assets\/ui\/power-up\//);
  assert.doesNotMatch(powerUpSource, /@assets\/uploads\//);
  assert.doesNotMatch(evolutionSkinSource, /@assets\/uploads\//);
});
