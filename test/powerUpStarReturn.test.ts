import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");

test("Active Pet refreshes the measured rarity-star anchor when Power Up closes", () => {
  assert.match(home, /\[activePet\?\.petTemplateId, activePet\?\.isHatched, activePetModal\]/);
  assert.match(home, /const settleFrame = window\.requestAnimationFrame\(update\)/);
  assert.match(home, /window\.cancelAnimationFrame\(settleFrame\)/);
  assert.match(home, /activePetSceneRect\.top \+ activePetSceneRect\.height \* 0\.32/);
});

test("Power Up lowers the whole scene without changing pet placement or enabling scrolling", () => {
  assert.match(power, /#game-viewport-hud \.pupage-stage \{ transform: translateY\(clamp\(8px, 1\.5dvh, 18px\)\); \}/);
  assert.match(power, /#game-viewport-hud \.pupage-scroll \{[\s\S]*?overflow: hidden;/);
  assert.match(power, /<PetPageOvalPlacement page="powerUp"/);
  assert.match(power, /<EvolutionPanel enabled fallbackRarity=\{rarity\} layout="orbit"/);
});
