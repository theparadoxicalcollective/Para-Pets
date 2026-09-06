const WORLD_MAP_WIDTH = 924;
const WORLD_MAP_HEIGHT = 1703;

/**
 * Scale each world from its actual map height so the complete vertical
 * composition stays visible. WorldPage stores a fixed per-world map height
 * (derived from each canonical background image) because worlds do not all
 * share the same aspect ratio.
 *
 * If the height-fit makes the rendered map wider than the viewport,
 * WorldPage's existing horizontal pan/clamp behavior exposes the left/right
 * portions instead of cropping the top or bottom of the artwork.
 */
export function calculateWorldFitScale(
  _frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  _fitFullComposition: boolean,
): number {
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) return 1;
  if (!Number.isFinite(mapHeight) || mapHeight <= 0) return frameHeight / WORLD_MAP_HEIGHT;
  return frameHeight / mapHeight;
}

export { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT };
