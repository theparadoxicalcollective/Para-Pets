import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientPointInRenderedElement } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const overlay = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");

test("Pet Care opts into full-device UI without migrating maps, home or admin placements", () => {
  assert.match(app, /<StagePageSurface key=\{location\} layout="viewport">\s*<PetCarePage/);
  assert.match(surface, /\{children\}/);
  assert.match(app, /<StagePageSurface layout="viewport">\s*<BagInventoryPage/);
});

test("Pet Care particle, reward and item-drag positions use actual scene dimensions", () => {
  assert.match(overlay, /clientPointInRenderedElement\(surface\.getBoundingClientRect\(\), x, y, surface\.clientWidth, surface\.clientHeight\)/);
  assert.match(overlay, /const w = surface\?\.clientWidth \?\? 0/);
  assert.match(overlay, /const h = surface\?\.clientHeight \?\? 0/);
  assert.match(overlay, /careRectPoint\(box, 0\.5, 0\.3\)/);
  assert.match(overlay, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(overlay, /const careGhostTarget = \(\) => document\.body/);
  assert.match(overlay, /const careGhostPoint = \(x: number, y: number\) => \(\{ x, y \}\)/);
});

test("translated tablet scene hit coordinates preserve fractional placement", () => {
  const rect = {left: 120, top: 55, width: 1024, height: 768};
  const p = clientPointInRenderedElement(rect, 632, 439, 1024, 768);
  assert.deepEqual(p, {x:512,y:384});
});
