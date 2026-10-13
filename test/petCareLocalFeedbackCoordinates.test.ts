import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

test("Pet Care feedback measures its own rendered overlay on every device", () => {
  assert.match(care, /const feedbackSurface = \(\) => overlayRef\.current/);
  assert.match(care, /clientPointInRenderedElement\(surface\.getBoundingClientRect\(\), x, y, surface\.clientWidth, surface\.clientHeight\)/);
  assert.match(care, /const careRectPoint = \(rect: DOMRect, x: number, y: number\) =>/);
  assert.match(care, /const w = surface\?\.clientWidth \?\? 0/);
  assert.match(care, /const h = surface\?\.clientHeight \?\? 0/);
  assert.doesNotMatch(care, /getStageScale|getDesignW|getStageLogicalCenter|clientRectPointToStage|\bDESIGN_H\b/);
  assert.match(care, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(care, /careGhostTarget\(\)/);
});
