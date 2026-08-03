import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care shelves retain effect labels and order items by their bar increase", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(page, /orderPetCareItemsByEffect\([\s\S]*?it\.type === "edibles"[\s\S]*?"edibles"/);
  assert.match(page, /orderPetCareItemsByEffect\([\s\S]*?it\.type === "gift"[\s\S]*?"gifts"/);
  assert.doesNotMatch(page, /pet-care-item-shelf__quantity/);
  assert.match(page, /pet-care-item-shelf__value--edible/);
  assert.match(page, /pet-care-item-shelf__value--gift/);
  assert.match(page, /onPointerDown=\{\(event\) => onItemPointerDown\(event, item\)\}/);
});

test("Pet Care uses the uploaded scene and decorative asset meters", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(page, /@assets\/ui\/pet-care\/pet-care-background\.png/);
  assert.match(page, /@assets\/ui\/pet-care\/loyalty-meter-frame\.png/);
  assert.match(page, /@assets\/ui\/pet-care\/hunger-meter-frame\.png/);
  assert.match(page, /@assets\/ui\/pet-care\/mood-meter-frame\.png/);
  assert.match(page, /backgroundImage: `[^`]*url\(\$\{feedingPageBg\}\)`/);
  assert.match(page, /frame=\{hungerMeterFrame\}/);
  assert.match(page, /frame=\{moodMeterFrame\}/);
  assert.match(page, /frame=\{loyaltyMeterFrame\}/);
});

test("decorative meters retain live percentages without separate status boxes", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(page, /percentage=\{hungerPct\}/);
  assert.match(page, /percentage=\{moodVal\}/);
  assert.match(page, /percentage=\{loyaltyPct\}/);
  assert.doesNotMatch(page, /data-testid="text-hunger-value"/);
  assert.doesNotMatch(page, /data-testid="text-mood-value"/);
  assert.match(page, /accessibleLabel=\{`Hunger \$\{hungerVal\} of \$\{hungerMax\}`\}/);
  assert.match(page, /accessibleLabel=\{`Mood \$\{moodVal\} of 100, \$\{moodLabel\}`\}/);
});

test("the dynamic mood face is embedded in the Mood meter medallion", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const moodMeter = page.slice(page.indexOf('frame={moodMeterFrame}'), page.indexOf('</PetCareAssetMeter>', page.indexOf('frame={moodMeterFrame}')));
  assert.match(moodMeter, /pet-care-meter__mood-face/);
  assert.match(moodMeter, /data-testid="img-mood-face"/);
  assert.equal(page.match(/data-testid="img-mood-face"/g)?.length, 1);
  assert.doesNotMatch(page, /Mood face icon centered beneath/);
});
