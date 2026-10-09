import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const powerUp = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const evolution = readFileSync("client/src/components/powerup/EvolutionPanel.tsx", "utf8");

test("tablet Power Up separates the stage and item bar while retaining phone rules", () => {
  assert.match(powerUp, /@media\(min-width: 768px\)/);
  assert.match(powerUp, /\.pupage-scroll \{[\s\S]*?overflow-y: auto/);
  assert.match(powerUp, /\.pupage-stage,[\s\S]*?height: clamp\(400px, 51dvh, 560px\)/);
  assert.match(powerUp, /\.pupage-inventory,[\s\S]*?margin-top: 20px/);
  assert.match(powerUp, /@media\(max-width:430px\)/);
  assert.match(powerUp, /style=\{\{ transform: \x60translate\(\$\{powerUpLocation\.x\}%/);
  assert.match(powerUp, /<PetPageOvalPlacement/);
});

test("tablet evolution slots expand around existing pet rather than shifting pet placement", () => {
  assert.match(evolution, /@media\(min-width:768px\)/);
  for (let slot = 1; slot <= 6; slot++) {
    assert.ok(evolution.includes(`.pupevo-slot:nth-of-type(${slot})`));
  }
  assert.match(evolution, /left:12% !important;top:39%/);
  assert.match(evolution, /left:88% !important;top:39%/);
});
