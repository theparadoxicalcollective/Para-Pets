import type { CostumePlacement } from "@shared/costumeFeature";

export interface CostumePoint {
  x: number;
  y: number;
}

export interface CostumeDragOffset {
  offsetX: number;
  offsetY: number;
}

export interface CostumeAnchorGeometry {
  posX: number;
  posY: number;
  width: number;
  height: number;
  pivotX?: number | null;
  pivotY?: number | null;
  rotation?: number | null;
}

/** Resolve the anchor pivot in the pet editor's 1000 × 1000 template space. */
export function getCostumeAnchorPoint(anchor?: CostumeAnchorGeometry | null): CostumePoint | null {
  if (!anchor) return null;
  return {
    x: anchor.posX + anchor.width * (anchor.pivotX ?? 50) / 100,
    y: anchor.posY + anchor.height * (anchor.pivotY ?? 50) / 100,
  };
}

/** Resolve a costume's top-left corner in template space for rendering and dragging. */
export function getCostumeCanvasPosition(
  anchor: CostumeAnchorGeometry | null | undefined,
  placement: CostumePlacement | null | undefined,
): { left: number; top: number } | null {
  const anchorPoint = getCostumePlacementAnchorPoint(anchor, placement);
  if (!anchorPoint || !placement) return null;
  return {
    left: anchorPoint.x + placement.posX - placement.width * placement.pivotX / 100,
    top: anchorPoint.y + placement.posY - placement.height * placement.pivotY / 100,
  };
}

/** Keep the grabbed point under the pointer instead of snapping the costume center to it. */
export function getCostumeDragOffset(
  pointer: CostumePoint,
  canvasPosition: { left: number; top: number },
): CostumeDragOffset {
  return {
    offsetX: pointer.x - canvasPosition.left,
    offsetY: pointer.y - canvasPosition.top,
  };
}

/** Convert a pointer position back into the normalized anchor-relative placement. */
export function getDraggedCostumePosition(
  pointer: CostumePoint,
  dragOffset: CostumeDragOffset,
  anchorPoint: CostumePoint,
  placement: CostumePlacement,
): Pick<CostumePlacement, "posX" | "posY"> {
  const left = pointer.x - dragOffset.offsetX;
  const top = pointer.y - dragOffset.offsetY;
  return {
    posX: left + placement.width * placement.pivotX / 100 - anchorPoint.x,
    posY: top + placement.height * placement.pivotY / 100 - anchorPoint.y,
  };
}

/** Resize both axes together so the saved costume proportions cannot be distorted. */
export function resizeCostumePlacement(
  placement: CostumePlacement,
  requestedSize: number,
): Pick<CostumePlacement, "width" | "height"> {
  const currentSize = Math.max(placement.width, placement.height);
  if (currentSize <= 0) return { width: 20, height: 20 };
  const smallestDimension = Math.min(placement.width, placement.height);
  const minimumSize = smallestDimension > 0 ? currentSize * (20 / smallestDimension) : 20;
  const nextSize = Math.max(minimumSize, Math.min(1000, requestedSize));
  const scale = nextSize / currentSize;
  return {
    width: Math.round(placement.width * scale),
    height: Math.round(placement.height * scale),
  };
}


/** An independent piece stores its pivot directly in the 1000×1000 pet canvas. */
export function getCostumePlacementAnchorPoint(anchor: CostumeAnchorGeometry | null | undefined, placement: CostumePlacement | null | undefined) {
  return placement?.anchorPart === "independent" ? { x: 0, y: 0 } : getCostumeAnchorPoint(anchor);
}

/** Explicit conversion preserves the canvas position and rotation shown in the editor. */
export function detachCostumePlacement(anchor: CostumeAnchorGeometry | null | undefined, placement: CostumePlacement): CostumePlacement | null {
  if (placement.anchorPart === "independent") return placement;
  const origin = getCostumeAnchorPoint(anchor);
  if (!origin) return null;
  return {
    ...placement, anchorPart: "independent", animation: "none", animationSpeed: 1,
    replacesWings: placement.anchorPart.includes("wing"),
    posX: origin.x + placement.posX,
    posY: origin.y + placement.posY,
  };
}

/** Move the independent pivot without moving the artwork's top-left corner. */
export function changeCostumePivot(placement: CostumePlacement, axis: "pivotX" | "pivotY", value: number): Partial<CostumePlacement> {
  const next = Math.max(0, Math.min(100, value));
  const coordinate = axis === "pivotX" ? "posX" : "posY";
  const dimension = axis === "pivotX" ? placement.width : placement.height;
  return { [axis]: next, [coordinate]: placement[coordinate] + dimension * (next - placement[axis]) / 100 };
}
