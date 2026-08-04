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

test("Pet Care item application is drag-only", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");

  assert.match(drag, /const blockLegacyTapToUse = \(event: MouseEvent\)/);
  assert.match(drag, /\.pet-care-item-shelf__item, \.pet-care-overlay \.pet-care-pet/);
  assert.match(drag, /event\.preventDefault\(\)/);
  assert.match(drag, /event\.stopImmediatePropagation\(\)/);
  assert.match(drag, /window\.addEventListener\("click", blockLegacyTapToUse, true\)/);
});

test("Pet Care drags the original shelf artwork above every shelf crop", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /querySelector<HTMLElement>\("\.pet-care-item-shelf__visible-artwork"\)/);
  assert.doesNotMatch(drag, /appendChild\(drag\.artwork\)/);
  assert.match(drag, /findFixedContainingBlock/);
  assert.match(drag, /requestAnimationFrame/);
  assert.match(drag, /translate3d/);
  assert.match(drag, /Horizontal movement belongs to the shelf's native scroller/);
  assert.match(drag, /drag\.artwork\.classList\.add\("pet-care-native-drag-artwork"\)/);
  assert.match(css, /body\.pet-care-native-item-dragging \.pet-care-inventory-section[\s\S]*?z-index: 30/);
  assert.match(css, /pet-care-item-shelf--native-dragging[\s\S]*?pet-care-item-shelf__viewport[\s\S]*?z-index: 4 !important;[\s\S]*?overflow: visible !important/);
  assert.match(css, /pet-care-item-shelf--native-dragging[\s\S]*?pet-care-item-shelf__stage[\s\S]*?pet-care-item-shelf__item[\s\S]*?overflow: visible !important;[\s\S]*?clip-path: none !important/);
  assert.match(css, /\.pet-care-native-drag-artwork[\s\S]*?position: fixed[\s\S]*?z-index: 10050[\s\S]*?overflow: visible !important/);
  assert.match(css, /body\.pet-care-native-item-dragging \.pet-care-drag-ghost__image[\s\S]*?visibility: hidden/);
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
