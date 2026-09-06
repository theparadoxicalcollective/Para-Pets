export interface WorldPercentPosition {
  x: number;
  y: number;
}

export interface PointerCoordinates {
  x: number;
  y: number;
}

export interface RenderedMapSize {
  width: number;
  height: number;
}

const MIN_WORLD_PERCENT = -10;
const MAX_WORLD_PERCENT = 110;

function clampWorldPercent(value: number): number {
  return Math.max(MIN_WORLD_PERCENT, Math.min(MAX_WORLD_PERCENT, value));
}

/**
 * Convert a pointer drag into the same percentage coordinate space used by
 * WorldPage. The rendered map size already includes the current responsive
 * scale, so this remains stable across phones, tablets, desktop, PWA/browser,
 * orientation changes, and the per-world map aspect ratios.
 */
export function calculateWorldDragPosition(
  origin: WorldPercentPosition,
  pointerStart: PointerCoordinates,
  pointerCurrent: PointerCoordinates,
  renderedMap: RenderedMapSize,
): WorldPercentPosition {
  const width = Number.isFinite(renderedMap.width) && renderedMap.width > 0
    ? renderedMap.width
    : 1;
  const height = Number.isFinite(renderedMap.height) && renderedMap.height > 0
    ? renderedMap.height
    : 1;

  return {
    x: clampWorldPercent(origin.x + ((pointerCurrent.x - pointerStart.x) / width) * 100),
    y: clampWorldPercent(origin.y + ((pointerCurrent.y - pointerStart.y) / height) * 100),
  };
}

export function worldPositionsDiffer(
  a: WorldPercentPosition,
  b: WorldPercentPosition,
  epsilon = 0.08,
): boolean {
  return Math.abs(a.x - b.x) > epsilon || Math.abs(a.y - b.y) > epsilon;
}
