const WORLD_MAP_WIDTH = 1080;
const WORLD_MAP_HEIGHT = 1920;

/**
 * Fit the entire authored map in the visible frame. Background, NPCs, decor,
 * and hotspots all share this one map transform, so placements keep their
 * admin-authored coordinates across narrow phones and wider screens.
 * WorldPage supplies a fixed per-world height for each background's aspect.
 */
export function calculateWorldFitScale(
  frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  _fitFullComposition: boolean,
): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0 || !Number.isFinite(frameHeight) || frameHeight <= 0) return 1;
  const safeMapHeight = Number.isFinite(mapHeight) && mapHeight > 0 ? mapHeight : WORLD_MAP_HEIGHT;
  return Math.min(frameWidth / WORLD_MAP_WIDTH, frameHeight / safeMapHeight);
}

export { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT };
