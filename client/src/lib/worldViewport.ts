const WORLD_MAP_WIDTH = 1080;
const WORLD_MAP_HEIGHT = 1920;

/**
 * Fill the visible frame with the authored map. Background, NPCs, decor,
 * and hotspots all share this one transform, so placements keep their
 * admin-authored coordinates while the player pans to off-screen areas.
 * WorldPage supplies a fixed per-world height for each background's aspect.
 */
export function calculateWorldFitScale(
  frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  _fitFullComposition: boolean,
  mapWidth: number = WORLD_MAP_WIDTH,
): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0 || !Number.isFinite(frameHeight) || frameHeight <= 0) return 1;
  const safeMapWidth = Number.isFinite(mapWidth) && mapWidth > 0 ? mapWidth : WORLD_MAP_WIDTH;
  const safeMapHeight = Number.isFinite(mapHeight) && mapHeight > 0 ? mapHeight : WORLD_MAP_HEIGHT;
  return Math.max(frameWidth / safeMapWidth, frameHeight / safeMapHeight);
}

/** Keep an oversized world draggable to every edge without showing empty space. */
export function clampWorldMapOffset(
  x: number, y: number, scale: number,
  frameWidth: number, frameHeight: number, mapHeight: number,
  mapWidth: number = WORLD_MAP_WIDTH,
): { x: number; y: number } {
  const safeMapWidth = Number.isFinite(mapWidth) && mapWidth > 0 ? mapWidth : WORLD_MAP_WIDTH;
  const safeMapHeight = Number.isFinite(mapHeight) && mapHeight > 0 ? mapHeight : WORLD_MAP_HEIGHT;
  const width = safeMapWidth * scale;
  const height = safeMapHeight * scale;
  return {
    x: width <= frameWidth ? (frameWidth - width) / 2 : Math.max(frameWidth - width, Math.min(0, x)),
    y: height <= frameHeight ? (frameHeight - height) / 2 : Math.max(frameHeight - height, Math.min(0, y)),
  };
}

export { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT };
