import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("client/src/App.tsx", "utf8");
const homeSource = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const routeSource = readFileSync("client/src/pages/PetLevelUpRoute.tsx", "utf8");
const levelUpSource = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
const animatorSource = readFileSync("client/src/components/PetAnimator.tsx", "utf8");

test("Level Up is a standalone full-screen route instead of a HomePage modal", () => {
  assert.match(appSource, /location\.startsWith\("\/pet-level-up\/"\)/);
  assert.match(appSource, /<Route path="\/pet-level-up\/:inventoryId">/);
  assert.match(homeSource, /navigate\(`\/pet-level-up\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.doesNotMatch(homeSource, /<PetLevelUpPage/);
  assert.match(routeSource, /<PetLevelUpPage/);
  assert.match(routeSource, /queryKey: \["\/api\/inventory"\]/);
});

test("Level Up keeps a still-pet fallback if the animated renderer throws", () => {
  assert.match(levelUpSource, /class LevelUpPetErrorBoundary/);
  assert.match(levelUpSource, /img-levelup-pet-render-fallback/);
  assert.match(levelUpSource, /<StableLevelUpPet/);
});

test("animated costume rendering tolerates incomplete API data", () => {
  assert.match(animatorSource, /normalizePetParts\(templateData\?\.parts\)/);
  assert.match(animatorSource, /Array\.isArray\(costumeData\?\.equipped\)/);
  assert.match(animatorSource, /normalizeCostumePlacements\(costume\.placements\)/);
});
