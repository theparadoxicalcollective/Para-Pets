import assert from "node:assert/strict";
import test from "node:test";
import type { CostumePlacement } from "../shared/costumeFeature";
import {
  getCostumeAnchorPoint,
  getCostumeCanvasPosition,
  getCostumeDragOffset,
  getDraggedCostumePosition,
  resizeCostumePlacement,
} from "../client/src/lib/costumePlacement";

const placement: CostumePlacement = {
  view: "front",
  anchorPart: "body",
  posX: 50,
  posY: -20,
  width: 100,
  height: 60,
  pivotX: 50,
  pivotY: 50,
  depth: "front",
};

test("costume placement resolves from anchor-relative template coordinates", () => {
  const anchor = { posX: 100, posY: 200, width: 400, height: 200, pivotX: 25, pivotY: 50 };
  assert.deepEqual(getCostumeAnchorPoint(anchor), { x: 200, y: 300 });
  assert.deepEqual(getCostumeCanvasPosition(anchor, placement), { left: 200, top: 250 });
});

test("drag math keeps the grabbed costume point beneath the pointer", () => {
  const canvasPosition = { left: 200, top: 250 };
  const dragOffset = getCostumeDragOffset({ x: 215, y: 270 }, canvasPosition);
  assert.deepEqual(dragOffset, { offsetX: 15, offsetY: 20 });
  assert.deepEqual(
    getDraggedCostumePosition({ x: 315, y: 370 }, dragOffset, { x: 200, y: 300 }, placement),
    { posX: 150, posY: 80 },
  );
});

test("costume size control preserves proportions and clamps template size", () => {
  assert.deepEqual(resizeCostumePlacement({ ...placement, width: 400, height: 200 }, 200), { width: 200, height: 100 });
  assert.deepEqual(resizeCostumePlacement({ ...placement, width: 400, height: 200 }, 2_000), { width: 1000, height: 500 });
  assert.deepEqual(resizeCostumePlacement({ ...placement, width: 400, height: 200 }, 5), { width: 40, height: 20 });
});
