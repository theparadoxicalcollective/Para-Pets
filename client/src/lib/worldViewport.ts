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

const WORLD_EXPANDED_CAMERA_PAN_RATIO = 0.06;
const WORLD_EXPANDED_CAMERA_MAX_PAN_MARGIN = 72;
const WORLD_REFERENCE_CAMERA_WIDTH = 390;
const WORLD_REFERENCE_CAMERA_HEIGHT = 844;

/**
 * Minimum real map kept beyond each edge of an expanded World camera.
 *
 * A pure cover fit can make a tablet aspect ratio nearly identical to the
 * authored map, which leaves no meaningful area to drag even though the scene
 * technically fills the device. Expanded cameras keep a small overscan margin
 * so the world always behaves like a camera looking into a larger scene.
 */
export function calculateExpandedWorldCameraPanMargin(
  frameWidth: number,
  frameHeight: number,
): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0 || !Number.isFinite(frameHeight) || frameHeight <= 0) return 0;
  return Math.min(
    WORLD_EXPANDED_CAMERA_MAX_PAN_MARGIN,
    Math.min(frameWidth, frameHeight) * WORLD_EXPANDED_CAMERA_PAN_RATIO,
  );
}

/**
 * Larger-device WorldPage camera policy.
 *
 * The iPhone 12 reference camera keeps its existing composition exactly.
 * Cameras that are genuinely larger than that reference retain a modest real
 * map margin beyond every edge. This avoids the tablet "static cover image"
 * effect while keeping the authored map, NPC/decor percentages, and uniform
 * scale contract unchanged.
 */
export function calculateExpandedWorldCameraScale(
  frameWidth: number,
  frameHeight: number,
  mapHeight: number,
  mapWidth: number = WORLD_MAP_WIDTH,
): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0 || !Number.isFinite(frameHeight) || frameHeight <= 0) return 1;
  const safeMapWidth = Number.isFinite(mapWidth) && mapWidth > 0 ? mapWidth : WORLD_MAP_WIDTH;
  const safeMapHeight = Number.isFinite(mapHeight) && mapHeight > 0 ? mapHeight : WORLD_MAP_HEIGHT;
  const referenceScale = Math.max(
    WORLD_REFERENCE_CAMERA_WIDTH / safeMapWidth,
    WORLD_REFERENCE_CAMERA_HEIGHT / safeMapHeight,
  );

  const referenceSizedCamera =
    frameWidth <= WORLD_REFERENCE_CAMERA_WIDTH + 0.5
    && frameHeight <= WORLD_REFERENCE_CAMERA_HEIGHT + 0.5;
  if (referenceSizedCamera) return referenceScale;

  const panMargin = calculateExpandedWorldCameraPanMargin(frameWidth, frameHeight);
  const explorableScale = Math.max(
    (frameWidth + panMargin * 2) / safeMapWidth,
    (frameHeight + panMargin * 2) / safeMapHeight,
  );
  return Math.max(referenceScale, explorableScale);
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

export {
  WORLD_MAP_WIDTH,
  WORLD_MAP_HEIGHT,
  WORLD_EXPANDED_CAMERA_PAN_RATIO,
  WORLD_EXPANDED_CAMERA_MAX_PAN_MARGIN,
};
