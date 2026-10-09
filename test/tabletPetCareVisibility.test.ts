import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("client/src/petCarePolish.css", "utf8");
const feeding = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

test("tablet Pet Care keeps its meters, controls and inventory in a reachable scene", () => {
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*?\.pet-care-overlay \{/);
  assert.match(css, /\.pet-care-overlay \.pet-care-header \{[\s\S]*?z-index: 30/);
  assert.match(css, /\.pet-care-overlay \.pet-care-header button \{[\s\S]*?min-width: 44px/);
  assert.match(css, /\.pet-care-overlay \.pet-care-inventory-section \{[\s\S]*?overflow-y: auto/);
  assert.match(css, /\.pet-care-overlay \.pet-care-inventory-jars \{[\s\S]*?max-width: 780px/);
});

test("Pet Care retains existing feed drop zone, jars, loyalty and close controls", () => {
  for (const id of [
    "overlay-feeding", "drop-zone-feed-pet", "loyalty-meter",
    "pet-care-gifts-shelf", "pet-care-edibles-shelf",
    "button-close-feeding", "button-care-help",
  ]) {
    if (id.includes("-shelf")) {
      assert.match(feeding, /data-testid=\{\x60pet-care-\$\{kind\}-shelf\x60\}/);
    } else {
      assert.ok(feeding.includes(id), id);
    }
  }
  assert.match(feeding, /onPointerMove=\{dragEnabled \? onItemPointerMove/);
  assert.doesNotMatch(css, /touch-action: pan-y/);
});
