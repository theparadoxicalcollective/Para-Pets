import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path: string) => readFileSync(path, "utf8");

test("card flip titles stay on the rotating front and back faces", () => {
  const source = file("client/src/components/CardDetailDialog.tsx");
  assert.match(source, /data-testid="card-front-face"/);
  assert.match(source, /data-testid="card-back-face"/);
  assert.match(source, /data-testid="card-back-title"/);
  assert.doesNotMatch(source, /data-testid="card-side-turn-title"/);
  assert.doesNotMatch(source, /--card-title-counter-turn/);
  assert.match(source, /transform: "rotateY\(180deg\)"/);
});

test("ready active egg hatch behavior remains merged", () => {
  const source = file("client/src/pages/HomePage.tsx");
  assert.match(source, /bjIsStep5TapMode\(\) \|\| eggHatchReady/);
  assert.match(source, /hatchHomeMutation\.mutate\(activePet\.inventoryId\)/);
  assert.match(source, /setShowSpeedUp\(true\)/);
});

test("badge list retains hidden scrollbar and vertical scrolling", () => {
  const source = file("client/src/pages/BadgePage.tsx");
  assert.match(source, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /\[scrollbar-width:none\]/);
  assert.match(source, /\[&::-webkit-scrollbar\]:hidden/);
});

test("market backdrop and closet pet preview remain non-interactive", () => {
  const market = file("client/src/pages/MarketPage.tsx");
  const closet = file("client/src/components/PetEquipAccessoriesPage.tsx");
  const adornments = file("client/src/components/PetCostumeEquipmentSection.tsx");
  assert.match(market, /data-testid="market-viewport-backdrop"[\s\S]*?pointer-events-none/);
  assert.match(closet, /closet-pet-preview[^\n]*pointer-events-none/);
  assert.match(closet, /z-\[8\] closet-accessory-slots/);
  assert.match(adornments, /z-\[8\] closet-adornment-slots/);
});
