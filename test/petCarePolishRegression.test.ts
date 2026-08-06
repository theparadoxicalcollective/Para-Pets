import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care layout polish stays route-scoped", () => {
  const main = readFileSync("client/src/main.tsx", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(main, /import "\.\/petCarePolish\.css";/);
  assert.match(main, /installScopedPetCareDragPolish\(\);/);
  assert.match(css, /\.pet-care-overlay \.pet-care-loyalty[\s\S]*?left: clamp\(4px/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter--vertical \.pet-care-meter__track[\s\S]*?width: 19%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood \.pet-care-meter[\s\S]*?width: min\(72%, 380px\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-inventory-section \.pet-care-hunger[\s\S]*?360px[\s\S]*?translateY\(-7px\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood,[\s\S]*?\.pet-care-overlay \.pet-care-hunger \.pet-care-meter[\s\S]*?overflow: visible/);
  assert.match(css, /\.pet-care-item-shelf--edibles[\s\S]*?\.pet-care-item-shelf__visible-artwork[\s\S]*?top: 4px/);
});

test("Pet Care is drag-only in normal mode and keeps emergency tap fallback", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(drag, /const blockLegacyTapToUse = \(event: MouseEvent\)/);
  assert.match(drag, /overlay\?\.dataset\.petCareDragEnabled !== "true"/);
  assert.match(drag, /event\.preventDefault\(\)/);
  assert.match(drag, /event\.stopImmediatePropagation\(\)/);
  assert.match(drag, /window\.addEventListener\("click", blockLegacyTapToUse, true\)/);
  // The React click handlers remain wired so explicit no-drag emergency mode
  // can still use the accessible tap-item / tap-pet fallback.
  assert.match(page, /onClick=\{\(\) => onItemClick\(item\)\}/);
  assert.match(page, /onClick=\{applySelectedCareItem\}/);
  assert.match(page, /data-pet-care-drag-enabled=\{dragEnabled \? "true" : "false"\}/);
  assert.match(page, /onPointerMove=\{dragEnabled \? onItemPointerMove/);
});

test("Pet Care drag uses one unclipped snapshot and hides the exact source inline", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /function copyRenderedArtwork/);
  assert.match(drag, /querySelector<HTMLElement>\("\.pet-care-item-shelf__normalized-image"\)/);
  assert.match(drag, /context\.drawImage\(rendered, 0, 0\)/);
  assert.match(drag, /function createRenderedDragGhost/);
  assert.match(drag, /document\.body\.appendChild\(ghost\)/);
  assert.match(drag, /drag\.artwork\.style\.opacity = "0"/);
  assert.match(drag, /drag\.artwork\.style\.visibility = "hidden"/);
  assert.match(drag, /drag\.originalArtworkStyle == null/);
  assert.match(drag, /drag\.ghost\?\.remove\(\)/);
  assert.doesNotMatch(drag, /pet-care-native-source-item/);
  assert.match(css, /\.pet-care-polished-drag-ghost[\s\S]*?position: fixed[\s\S]*?z-index: 10060/);
  assert.match(css, /body\.pet-care-polished-ghost-active \.pet-care-drag-ghost__image[\s\S]*?visibility: hidden !important;[\s\S]*?opacity: 0 !important/);
});

test("Pet Care shows green lower-left quantities for stacked inventory", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /queryClient\.getQueryData<unknown>\(\["\/api\/inventory"\]\)/);
  assert.match(drag, /buildPetCareInventoryStacks/);
  assert.match(drag, /orderPetCareItemsByEffect/);
  assert.match(drag, /item\.dataset\.petCareStackQuantity = String\(quantity\)/);
  assert.match(drag, /new MutationObserver\(scheduleQuantitySync\)/);
  assert.match(drag, /getQueryCache\(\)\.subscribe\(scheduleQuantitySync\)/);
  assert.match(css, /data-pet-care-stack-quantity[\s\S]*?content: "×" attr\(data-pet-care-stack-quantity\)/);
  assert.match(css, /data-pet-care-stack-quantity[\s\S]*?left: 6px;[\s\S]*?bottom: 24%;/);
  assert.match(css, /color: #9dff83/);
});

test("Pet Care drop feedback is visible outside the zero-sized burst origin", () => {
  const drag = readFileSync("client/src/petCarePolish.ts", "utf8");
  const css = readFileSync("client/src/petCarePolish.css", "utf8");

  assert.match(drag, /function createDropSparkles/);
  assert.match(drag, /DROP_SPARKLE_COUNT = 14/);
  assert.match(drag, /pointInsideExpandedPetDropZone/);
  assert.match(drag, /createDropSparkles\(rect\.left \+ rect\.width \/ 2, rect\.top \+ rect\.height \* 0\.48\)/);
  assert.match(css, /\.pet-care-drop-sparkle-burst[\s\S]*?overflow: visible;[\s\S]*?contain: layout style;/);
  assert.doesNotMatch(css, /contain: layout style paint/);
  assert.match(css, /\.pet-care-drop-sparkle-core/);
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
  assert.match(css, /\.pet-care-meter--mood \.pet-care-meter__track[\s\S]*?translateY\(1px\)/);
  assert.match(css, /\.pet-care-meter--hunger \.pet-care-meter__track[\s\S]*?translateY\(5px\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter__mood-face-window[\s\S]*?top: 24\.5%;[\s\S]*?left: 6\.1%;[\s\S]*?width: 18\.7%/);
  assert.match(css, /\.pet-care-overlay \.pet-care-meter__mood-face[\s\S]*?scale\(1\.15\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-mood \.pet-care-meter::before[\s\S]*?background: rgba\(0, 0, 0, 0\.22\)/);
  assert.match(css, /\.pet-care-overlay \.pet-care-item-shelf__stage::before[\s\S]*?radial-gradient/);
  assert.match(css, /\.pet-care-overlay \.pet-care-loyalty::before[\s\S]*?background: rgba\(0, 0, 0, 0\.16\)/);
});
