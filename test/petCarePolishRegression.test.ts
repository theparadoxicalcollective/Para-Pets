import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care layout polish stays route-scoped", () => {
  const main = readFileSync("client/src/main.tsx", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(main, /import "\.\/petCarePolish\.css";/);
  assert.match(main, /installPetCareDragPolish\(\);/);
  assert.match(css, /\.pet-care-overlay \.pet-care-loyalty[\s\S]*?left: clamp\(4px/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter--vertical \.pet-care-meter__track[\s\S]*?width: 19%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood \.pet-care-meter[\s\S]*?width: min\(72%, 380px\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-inventory-section \.pet-care-hunger[\s\S]*?360px[\s\S]*?translateY\(-7px\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood,[\s\S]*?\.pet-care-overlay \.pet-care-hunger \.pet-care-meter[\s\S]*?overflow: visible/);
  assert.match(css, /\.pet-care-item-shelf--edibles[\s\S]*?\.pet-care-item-shelf__visible-artwork[\s\S]*?top: 4px/);
});

test("Pet Care keeps tap-to-select available beside drag-and-drop", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.doesNotMatch(drag, /blockLegacyTapToUse/);
  assert.doesNotMatch(drag, /addEventListener\("click"/);
  assert.match(page, /onClick=\{\(\) => onItemClick\(item\)\}/);
  assert.match(page, /onClick=\{applySelectedCareItem\}/);
});

test("Pet Care empties the source shelf slot and leaves React's ghost visible", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /classifyPetCareItemGesture/);
  assert.match(drag, /drag\.item\.classList\.add\("pet-care-native-source-item"\)/);
  assert.match(drag, /drag\.shelf\.classList\.add\("pet-care-item-shelf--native-dragging"\)/);
  assert.doesNotMatch(drag, /pet-care-native-drag-artwork/);
  assert.doesNotMatch(drag, /drag\.artwork\.style/);
  assert.match(css, /pet-care-native-source-item[\s\S]*?pet-care-item-shelf__visible-artwork[\s\S]*?opacity: 0 !important;[\s\S]*?visibility: hidden !important/);
  assert.match(css, /body\.pet-care-native-item-dragging \.pet-care-drag-ghost__image[\s\S]*?visibility: visible !important;[\s\S]*?opacity: 1 !important/);
  assert.doesNotMatch(css, /\.pet-care-native-drag-artwork/);
});

test("Pet Care drop feedback uses a lightweight sparkle burst", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /function createDropSparkles/);
  assert.match(drag, /pointInsideExpandedPetDropZone/);
  assert.match(drag, /createDropSparkles\(sparkleX, sparkleY\)/);
  assert.match(css, /\.pet-care-drop-sparkle-burst/);
  assert.match(css, /@keyframes pet-care-drop-sparkle-pop/);
});

test("Pet Care assists natural strokes through the existing React petting path", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");

  assert.match(drag, /PET_STROKE_ASSIST_DISTANCE_PX/);
  assert.match(drag, /function dispatchPettingAssist/);
  assert.match(drag, /new PointerEvent\("pointermove"/);
  assert.match(drag, /synthetic\.__paraPettingAssist = true/);
  assert.match(drag, /stroke\.target\.dispatchEvent\(synthetic\)/);
  assert.doesNotMatch(drag, /\/petting-reward|apiRequest|fetch\(/);
});

test("Pet Care frames receive subtle shadows and calibrated fills", () => {
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(css, /\.pet-care-overlay \.pet-care-meter--hunger[\s\S]*?--pet-care-track-top: 40%;[\s\S]*?--pet-care-track-bottom: 25%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter--mood[\s\S]*?--pet-care-track-top: 35%;[\s\S]*?--pet-care-track-right: 4\.3%;[\s\S]*?--pet-care-track-bottom: 24%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter__mood-face-window[\s\S]*?top: 24\.5%;[\s\S]*?left: 6\.1%;[\s\S]*?width: 18\.7%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter__mood-face[\s\S]*?scale\(1\.15\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood \.pet-care-meter::before[\s\S]*?background: rgba\(0, 0, 0, 0\.22\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-item-shelf__stage::before[\s\S]*?radial-gradient/);
  assert.match(css, /\.pet-care-overlay \.pet-care-loyalty::before[\s\S]*?background: rgba\(0, 0, 0, 0\.16\)/);
});
