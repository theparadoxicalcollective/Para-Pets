import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care jars retain effect ordering while expanding stacks into unit visuals", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /orderPetCareItemsByEffect\([\s\S]*?it\.type === "edibles"[\s\S]*?"edibles"/);
  assert.match(page, /orderPetCareItemsByEffect\([\s\S]*?it\.type === "gift"[\s\S]*?"gifts"/);
  assert.match(page, /const PET_CARE_JAR_VISUAL_CAPACITY = 48;/);
  assert.match(page, /function buildPetCareJarVisuals\(items: PetCareShelfItem\[\]\)/);
  assert.match(page, /item: \{ \.\.\.entry\.item, quantity: 1, displayQuantity: 1 \}/);
  assert.match(page, /onPointerDown=\{dragEnabled \? \(event\) => beginJarMove\(event, visual\) : undefined\}/);
  assert.doesNotMatch(page, /pet-care-item-shelf__quantity/);
  assert.doesNotMatch(page, /pet-care-item-shelf__value--edible/);
  assert.doesNotMatch(page, /pet-care-item-shelf__value--gift/);
});

test("Pet Care uses the original scene and decorative asset meters", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /@assets\/IMG_5734_1783098320823\.jpeg/);
  assert.doesNotMatch(page, /@assets\/ui\/pet-care\/pet-care-background\.png/);
  assert.match(page, /@assets\/ui\/pet-care\/loyalty-meter-frame\.png/);
  assert.match(page, /@assets\/ui\/pet-care\/hunger-meter-frame\.png/);
  assert.match(page, /@assets\/ui\/pet-care\/mood-meter-frame\.png/);
  assert.match(page, /backgroundImage: `[^`]*url\(\$\{feedingPageBg\}\)`/);
  assert.match(page, /frame=\{hungerMeterFrame\}/);
  assert.match(page, /frame=\{moodMeterFrame\}/);
  assert.match(page, /frame=\{loyaltyMeterFrame\}/);
});

test("decorative meters retain live percentages without separate status boxes", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /percentage=\{hungerPct\}/);
  assert.match(page, /percentage=\{moodVal\}/);
  assert.match(page, /percentage=\{loyaltyPct\}/);
  assert.doesNotMatch(page, /data-testid="text-hunger-value"/);
  assert.doesNotMatch(page, /data-testid="text-mood-value"/);
  assert.match(page, /accessibleLabel=\{`Hunger \$\{hungerVal\} of \$\{hungerMax\}`\}/);
  assert.match(page, /accessibleLabel=\{`Mood \$\{moodVal\} of 100, \$\{moodLabel\}`\}/);
});

test("the dynamic mood face is clipped inside the Mood meter medallion", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");
  const moodMeter = page.slice(page.indexOf('frame={moodMeterFrame}'), page.indexOf('</PetCareAssetMeter>', page.indexOf('frame={moodMeterFrame}')));
  assert.match(moodMeter, /pet-care-meter__mood-face-window/);
  assert.match(moodMeter, /pet-care-meter__mood-face/);
  assert.match(moodMeter, /data-testid="img-mood-face"/);
  assert.equal(page.match(/data-testid="img-mood-face"/g)?.length, 1);
  assert.match(page, /moodFace = moodFaceHappy/);
  assert.match(page, /moodFace = moodFaceHungry/);
  assert.match(page, /moodFace = moodFaceSad/);
  assert.match(page, /moodFace = moodFaceContent/);
  assert.match(css, /\.pet-care-meter__mood-face-window[\s\S]*?overflow: hidden;[\s\S]*?border-radius: 50%;/);
  assert.match(css, /\.pet-care-meter__mood-face \{[\s\S]*?padding: 0;[\s\S]*?transform: scale\(/);
  assert.doesNotMatch(page, /Mood face icon centered beneath/);
});

test("Pet Care meters clamp finite percentages and use separate responsive scene zones", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");

  assert.match(page, /Number\.isFinite\(percentage\)/);
  assert.match(page, /Number\.isFinite\(rawHunger\)/);
  assert.match(page, /Number\.isFinite\(rawMood\)/);
  assert.match(page, /Number\.isFinite\(rawLoyalty\)/);
  assert.match(css, /\.pet-care-meter--horizontal \.pet-care-meter__track[\s\S]*?overflow: hidden/);
  assert.match(css, /\.pet-care-meter--horizontal \.pet-care-meter__fill \{[\s\S]*?top: var\(--pet-care-fill-inset, 0%\);[\s\S]*?height: calc\(100%/);
  assert.match(page, /className="pet-care-mood" data-testid="pet-care-mood-zone"/);
  assert.match(page, /className="pet-care-hunger" data-testid="pet-care-hunger-zone"/);
  assert.doesNotMatch(page, /pet-care-status/);
  assert.match(css, /\.pet-care-mood \{[\s\S]*?top: var\(--pet-care-mood-top\)/);
  assert.match(css, /\.pet-care-hunger \{[\s\S]*?bottom: var\(--pet-care-hunger-bottom\)/);
  assert.match(css, /--pet-care-mood-top:[^;]*env\(safe-area-inset-top/);
  assert.match(css, /--pet-care-hunger-bottom:[^;]*env\(safe-area-inset-bottom/);
  assert.match(css, /height: 100dvh/);
});


test("Pet Care hunger follows the server care-stat scale and updates from feed responses", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");
  assert.match(page, /const maxHunger = 1000;/);
  assert.doesNotMatch(page, /maxHunger = Number\.isFinite\(petHealth\)/);
  const feed = page.slice(page.indexOf("const feedMutation"), page.indexOf("const updateDragGhostPosition"));
  assert.match(feed, /return await res\.json\(\)/);
  assert.match(feed, /qc\.setQueryData\(\["\/api\/inventory"\]/);
  assert.match(feed, /totalFeedPoints/);
  assert.match(css, /width: min\(calc\(100% - var\(--pet-care-usable-left\) - var\(--pet-care-scene-right\)\), 390px\)/);
  assert.match(css, /transform: translateX\(calc\(\(var\(--pet-care-usable-left\) - var\(--pet-care-scene-right\)\) \/ 2\)\)/);
});
