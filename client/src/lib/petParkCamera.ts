import { parkGroundSize } from "@shared/petParkGround";

/** Camera uses world coordinates, never background image size or a device reference stage. */
const PARK_BASE_VIEW_WIDTH = 1100;
const PARK_BASE_VIEW_HEIGHT = 1700;
export const PARK_ZOOM_MIN = 0.7;
export const PARK_ZOOM_MAX = 1.6;
export const PARK_ZOOM_STEP = 0.15;

export function parkClampZoom(value: number): number {
  return Math.max(PARK_ZOOM_MIN, Math.min(PARK_ZOOM_MAX, Number.isFinite(value) ? value : 1));
}

export function parkCameraGeometry(viewWidth: number, viewHeight: number, groundLevel: number, zoom = 1, overscan = 1.18) {
  const { width: worldWidth, height: worldHeight } = parkGroundSize(groundLevel);
  const width = Math.max(1, viewWidth);
  const height = Math.max(1, viewHeight);
  // Keep buildings, pets and effects at the SAME visual scale when grass expands.
  // The ground grows under the camera instead of zooming everything out.
  const scale = Math.max(width / PARK_BASE_VIEW_WIDTH, height / PARK_BASE_VIEW_HEIGHT) * overscan * parkClampZoom(zoom);
  const sceneWidth = worldWidth * scale;
  const sceneHeight = worldHeight * scale;
  return {
    worldWidth, worldHeight, scale, sceneWidth, sceneHeight,
    limitX: Math.max(0, sceneWidth - width),
    limitY: Math.max(0, sceneHeight - height),
  };
}

export function parkClampCamera(pan: { x: number; y: number }, limits: { limitX: number; limitY: number }) {
  return {
    x: Math.max(-limits.limitX, Math.min(0, pan.x)),
    y: Math.max(-limits.limitY, Math.min(0, pan.y)),
  };
}

/** Keep the world point under the pointer (or pinch midpoint) stationary while zooming. */
export function parkZoomAnchorPan(
  previousPan: { x: number; y: number }, previousScale: number, nextScale: number,
  anchor: { x: number; y: number }, bounds: { limitX: number; limitY: number },
): { x: number; y: number } {
  const ratio = nextScale / previousScale;
  return parkClampCamera({
    x: anchor.x - (anchor.x - previousPan.x) * ratio,
    y: anchor.y - (anchor.y - previousPan.y) * ratio,
  }, bounds);
}

/** Add ground outward around the old center, preserving the current camera focal point. */
export function parkExpansionCameraPan(
  pan: { x: number; y: number }, scale: number,
  previousSize: { width: number; height: number },
  nextSize: { width: number; height: number },
  bounds: { limitX: number; limitY: number },
): { x: number; y: number } {
  return parkClampCamera({
    x: pan.x - (nextSize.width - previousSize.width) * scale / 2,
    y: pan.y - (nextSize.height - previousSize.height) * scale / 2,
  }, bounds);
}
