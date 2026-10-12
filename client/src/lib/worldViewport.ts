import { sceneCameraPointerDelta } from "./sceneCameraCoordinates";
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
 * Fit the actual camera, not a phone-sized reference plane. The authored map
 * remains the coordinate owner for backgrounds, NPCs and hotspots.
 *
 * Preserve the natural cover fit for phone-sized cameras; larger cameras keep
 * the existing modest overscan so tablet/desktop worlds remain pannable.
 * This choice is based on available map coverage rather than device identity.
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
  const coverScale = Math.max(frameWidth / safeMapWidth, frameHeight / safeMapHeight);

  // Compact cameras use the map's natural cover fit. Wider presentation
  // surfaces retain the existing tablet/desktop exploration margin.
  // This is a responsive breakpoint, not a 390x844 reference coordinate plane.
  if (Math.min(frameWidth, frameHeight) < 600) return coverScale;

  const panMargin = calculateExpandedWorldCameraPanMargin(frameWidth, frameHeight);
  return Math.max(
    (frameWidth + panMargin * 2) / safeMapWidth,
    (frameHeight + panMargin * 2) / safeMapHeight,
  );
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

/** Pointer travel in the actual rendered map viewport's local CSS coordinate plane. */
export function worldCameraPointerDelta(deltaX: number, deltaY: number, camera: HTMLElement | null): { x: number; y: number } {
  return sceneCameraPointerDelta(deltaX, deltaY, camera);
}
