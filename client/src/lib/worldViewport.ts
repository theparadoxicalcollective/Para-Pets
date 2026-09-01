const WORLD_MAP_WIDTH = 924;
const WORLD_MAP_HEIGHT = 1703;

/**
 * World maps are authored as fixed 924×1703 portrait compositions. Scale the
 * entire composition uniformly so BOTH dimensions fit inside the available
 * viewport. Using the smaller of the width and height scales guarantees that
 * neither axis can overflow, so players never need to pan or scroll left/right
 * or up/down to see the full world background.
 *
 * The map remains centered by WorldPage. Admin hotspot coordinates stay in the
 * same percentage-based world space, so this changes presentation only.
 */
export function calculateWorldFitScale(
  frameWidth: number,
  frameHeight: number,
  _mapHeight: number,
  _fitFullComposition: boolean,
): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return 1;
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) return 1;

  const widthScale = frameWidth / WORLD_MAP_WIDTH;
  const heightScale = frameHeight / WORLD_MAP_HEIGHT;
  return Math.min(widthScale, heightScale);
}
