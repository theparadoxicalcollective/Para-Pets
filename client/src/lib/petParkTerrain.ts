/**
 * Pure world-space sampling for the Pet Park's painterly terrain.
 * This does not change or project saved building/pet/decor coordinates.
 */
export type ParkTerrainViewport = {
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  scale: number;
  panX: number;
  panY: number;
};

export type ParkTerrainBounds = { left: number; top: number; right: number; bottom: number };

export function parkVisibleTerrainBounds(view: ParkTerrainViewport): ParkTerrainBounds {
  const scale = Math.max(0.001, view.scale);
  return {
    left: Math.max(0, Math.min(view.worldWidth, -view.panX / scale)),
    top: Math.max(0, Math.min(view.worldHeight, -view.panY / scale)),
    right: Math.max(0, Math.min(view.worldWidth, (view.viewportWidth - view.panX) / scale)),
    bottom: Math.max(0, Math.min(view.worldHeight, (view.viewportHeight - view.panY) / scale)),
  };
}

/** Only sample cells intersecting the camera plus a small brush overscan. */
export function parkTerrainCellWindow(bounds: ParkTerrainBounds, stepX: number, stepY: number, pad = 1) {
  if (stepX <= 0 || stepY <= 0) throw new RangeError("Terrain cell dimensions must be positive");
  return {
    minX: Math.floor(bounds.left / stepX) - pad,
    maxX: Math.ceil(bounds.right / stepX) + pad,
    minY: Math.floor(bounds.top / stepY) - pad,
    maxY: Math.ceil(bounds.bottom / stepY) + pad,
  };
}

/** Stable, unsigned coordinate hash: shifting the camera never changes a grass tuft. */
export function parkTerrainNoise(x: number, y: number, salt = 0): number {
  let hash = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
