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
  const anchorPoint = getCostumeAnchorPoint(anchor);
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
