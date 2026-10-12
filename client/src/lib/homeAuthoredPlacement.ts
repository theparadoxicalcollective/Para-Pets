import { scenePointToPlacement } from "./stage";

export interface HomePlacementPoint {
  xPct: number;
  yPct: number;
}

export interface HomePlacementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const HOME_DECOR_PLACEMENT_BOUNDS: HomePlacementBounds = {
  minX: 0.02,
  maxX: 0.98,
  minY: 0.02,
  maxY: 0.98,
};

export const HOME_INVENTORY_DROP_BOUNDS: HomePlacementBounds = {
  minX: 0.03,
  maxX: 0.97,
  minY: 0.03,
  maxY: 0.97,
};

export function clampHomePlacementPoint(
  point: HomePlacementPoint,
  bounds: HomePlacementBounds,
): HomePlacementPoint {
  return {
    xPct: Math.max(bounds.minX, Math.min(bounds.maxX, point.xPct)),
    yPct: Math.max(bounds.minY, Math.min(bounds.maxY, point.yPct)),
  };
}

/**
 * Convert a drag measured in the canonical stage back into the saved home
 * percentage plane. The saved layout therefore belongs to the authored home
 * scene rather than the phone/tablet/desktop used to edit it.
 */
export function dragHomePlacement(
  origin: HomePlacementPoint,
  stageDx: number,
  stageDy: number,
  sceneWidth: number,
  sceneHeight: number,
  bounds: HomePlacementBounds,
): HomePlacementPoint {
  if (
    !Number.isFinite(sceneWidth)
    || !Number.isFinite(sceneHeight)
    || sceneWidth <= 0
    || sceneHeight <= 0
  ) {
    return origin;
  }

  const delta = scenePointToPlacement({ x: stageDx, y: stageDy }, { width: sceneWidth, height: sceneHeight });
  if (!delta) return origin;
  return clampHomePlacementPoint({
    xPct: origin.xPct + delta.x,
    yPct: origin.yPct + delta.y,
  }, bounds);
}

export function homeClientPointToPlacement(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top">,
  panX: number,
  sceneWidth: number,
  sceneHeight: number,
  clientToScene: (clientX: number, clientY: number) => { x: number; y: number },
  bounds: HomePlacementBounds = HOME_INVENTORY_DROP_BOUNDS,
): HomePlacementPoint | null {
  const local = clientToScene(clientX, clientY);
  const origin = clientToScene(rect.left, rect.top);
  const placement = scenePointToPlacement(
    { x: local.x - origin.x - panX, y: local.y - origin.y },
    { width: sceneWidth, height: sceneHeight },
  );
  if (!placement) return null;
  return clampHomePlacementPoint({ xPct: placement.x, yPct: placement.y }, bounds);
}

/** Resolve a pointer drop into saved scene percentages using the rendered camera, not the phone stage. */
export function homeCameraDropToPlacement(
  clientX: number,
  clientY: number,
  camera: HTMLElement,
  panX: number,
  sceneWidth: number,
  sceneHeight: number,
  bounds: HomePlacementBounds = HOME_INVENTORY_DROP_BOUNDS,
): HomePlacementPoint | null {
  const rect = camera.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || camera.clientWidth <= 0 || camera.clientHeight <= 0) return null;
  const localX = (clientX - rect.left) * camera.clientWidth / rect.width;
  const localY = (clientY - rect.top) * camera.clientHeight / rect.height;
  const placement = scenePointToPlacement(
    { x: localX - panX, y: localY },
    { width: sceneWidth, height: sceneHeight },
  );
  if (!placement) return null;
  return clampHomePlacementPoint({ xPct: placement.x, yPct: placement.y }, bounds);
}
