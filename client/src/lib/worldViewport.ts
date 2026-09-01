const WORLD_MAP_WIDTH = 924;
const WORLD_MAP_HEIGHT = 1703;

/**
 * World maps use a fixed 924×1703 portrait design space. Scale strictly from
 * the available viewport height so the full vertical composition is always
 * visible with no up/down scrolling. If that height-fit makes the rendered map
 * wider than the viewport, WorldPage's existing horizontal pan/clamp behavior
 * exposes the cut-off left/right portions instead of shrinking the whole map.
 *
 * This keeps the visual treatment consistent across every world while leaving
 * percentage-based admin hotspot coordinates and destination behavior intact.
 */
export function calculateWorldFitScale(
  _frameWidth: number,
  frameHeight: number,
  _mapHeight: number,
  _fitFullComposition: boolean,
): number {
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) return 1;
  return frameHeight / WORLD_MAP_HEIGHT;
}

export { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT };
