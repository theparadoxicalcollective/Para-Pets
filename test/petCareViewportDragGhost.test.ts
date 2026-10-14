import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

test("Pet Care drag ghost uses viewport client coordinates and body portal", () => {
  assert.match(care, /const careGhostTarget = \(\) => document\.body/);
  assert.match(care, /const careGhostPoint = \(x: number, y: number\) => \(\{ x, y \}\)/);
  assert.match(care, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(care, /position: "fixed"/);
  assert.match(care, /pointerEvents: "none"/);
  assert.match(care, /getPetCareDragGhostTransform\(point\.x, point\.y\)/);
  assert.doesNotMatch(care, /clientToStagePortal|getStagePortalTarget/);
});

test("Pet Care drag pointer cleanup and drop-zone logic are preserved", () => {
  assert.match(care, /onPointerCancel=\{dragEnabled \? onItemPointerCancel : undefined\}/);
  assert.match(care, /onLostPointerCapture=\{dragEnabled \? onItemPointerCancel : undefined\}/);
  assert.match(care, /cleanupItemGesture/);
  assert.match(care, /pointInsideExpandedPetDropZone/);
  assert.match(care, /PET_CARE_DROP_PADDING_PX/);
});
