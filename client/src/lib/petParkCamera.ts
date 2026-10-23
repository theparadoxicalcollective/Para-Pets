/** Pet Park world units are independent of device pixels and of the old iPhone stage. */
export const PARK_WORLD_WIDTH = 1100;
export const PARK_FALLBACK_ASPECT = 1700 / 1100;

export function parkWorldHeight(aspect: number): number {
  return PARK_WORLD_WIDTH * (Number.isFinite(aspect) && aspect > 0 ? aspect : PARK_FALLBACK_ASPECT);
}

export function parkCameraGeometry(viewWidth: number, viewHeight: number, imageAspect: number, overscan = 1.18) {
  const worldWidth = PARK_WORLD_WIDTH;
  const worldHeight = parkWorldHeight(imageAspect);
  const width = Math.max(1, viewWidth);
  const height = Math.max(1, viewHeight);
  const scale = Math.max(width / worldWidth, height / worldHeight) * overscan;
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

/** Read the source image's true ratio, falling back when missing or invalid. */
export function parkImageAspect(width: number, height: number): number {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? height / width : PARK_FALLBACK_ASPECT;
}
