import { parkGroundSize } from "@shared/petParkGround";

/** Camera uses world coordinates, never background image size or a device reference stage. */
const PARK_BASE_VIEW_WIDTH = 1100;
const PARK_BASE_VIEW_HEIGHT = 1700;

export function parkCameraGeometry(viewWidth: number, viewHeight: number, groundLevel: number, overscan = 1.18) {
  const { width: worldWidth, height: worldHeight } = parkGroundSize(groundLevel);
  const width = Math.max(1, viewWidth);
  const height = Math.max(1, viewHeight);
  // Keep buildings, pets and effects at the SAME visual scale when grass expands.
  // The ground grows under the camera instead of zooming everything out.
  const scale = Math.max(width / PARK_BASE_VIEW_WIDTH, height / PARK_BASE_VIEW_HEIGHT) * overscan;
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
