import { dragScenePercentage } from "@/lib/coordinateContracts";

export interface WorldPlacementBounds {
  min: number;
  max: number;
}

export interface WorldPlacementPercent {
  x: number;
  y: number;
}

export const WORLD_PLACEMENT_BOUNDS = {
  location: { min: -10, max: 110 },
  decor: { min: 0, max: 100 },
  object: { min: -10, max: 110 },
} as const satisfies Record<string, WorldPlacementBounds>;

export function clampWorldPlacementPercent(value: number, bounds: WorldPlacementBounds): number {
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

/**
 * Convert a physical pointer delta back into the authored percentage plane.
 * Saved coordinates stay tied to the world/location surface rather than the
 * tablet, phone, or desktop pixels used to edit it.
 */
export function dragWorldPlacementPercent(
  origin: WorldPlacementPercent,
  dx: number,
  dy: number,
  surfaceWidth: number,
  surfaceHeight: number,
  bounds: WorldPlacementBounds,
): WorldPlacementPercent {
  if (
    !Number.isFinite(surfaceWidth)
    || !Number.isFinite(surfaceHeight)
    || surfaceWidth <= 0
    || surfaceHeight <= 0
  ) {
    return origin;
  }

  return dragScenePercentage(
    origin,
    { x: dx, y: dy },
    { width: surfaceWidth, height: surfaceHeight },
    { minX: bounds.min, maxX: bounds.max, minY: bounds.min, maxY: bounds.max },
  );
}

export function pointInWorldPlacementSurface(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function clientPointToWorldPlacementPercent(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  bounds: WorldPlacementBounds = WORLD_PLACEMENT_BOUNDS.decor,
): WorldPlacementPercent | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clampWorldPlacementPercent(((clientX - rect.left) / rect.width) * 100, bounds),
    y: clampWorldPlacementPercent(((clientY - rect.top) / rect.height) * 100, bounds),
  };
}
