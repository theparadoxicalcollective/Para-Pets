import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("CardStar.png is the shared rarity image for cards and active-pet rarity", () => {
  const cardPreview = read("client/src/components/CardPreview.tsx");
  const petWorld = read("client/src/pages/PetWorldPage.tsx");
  const homePage = read("client/src/pages/HomePage.tsx");

  assert.match(cardPreview, /import cardStarImg from "@assets\/uploads\/CardStar\.png"/);
  assert.match(cardPreview, /src=\{cardStarImg\}/);

  assert.match(petWorld, /import cardStarImg from "@assets\/uploads\/CardStar\.png"/);
  assert.match(petWorld, /data-testid="world-pet-rarity-star"/);
  assert.match(petWorld, /src=\{cardStarImg\}/);
  assert.doesNotMatch(petWorld, /<polygon points="12,2 15\.09,8\.26/);

  assert.match(homePage, /import cardStarImg from "@assets\/uploads\/CardStar\.png"/);
  assert.match(homePage, /data-testid="home-active-pet-rarity-star"/);
  assert.match(homePage, /src=\{cardStarImg\}/);
  assert.doesNotMatch(homePage, /Photoroom_20260331_20947_PM_1774984267132\.png/);
});
