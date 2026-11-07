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

/**
 * Affine reprojection of a terrain raster painted for a previous camera.
 * The preview canvas extends by marginX/Y around the viewport. Mapping the
 * old world pixel through this transform must yield the same screen pixel as
 * the current camera's world projection, with no scene-scale distortion.
 */
export function parkTerrainPreviewTransform(
  last: Pick<ParkTerrainViewport, "scale" | "panX" | "panY">,
  next: Pick<ParkTerrainViewport, "scale" | "panX" | "panY">,
  marginX: number, marginY: number,
) {
  const ratio = next.scale / Math.max(0.001, last.scale);
  return {
    ratio,
    dx: next.panX - last.panX * ratio + marginX * (1 - ratio),
    dy: next.panY - last.panY * ratio + marginY * (1 - ratio),
  };
}

/** During a camera pan/zoom the terrain reuses a cached raster, which
 * extends beyond the viewport by margins. Reprojection is safe ONLY while
 * the scaled bitmap still covers the entire visible viewport. Otherwise a
 * hard seam of the plain fallback green appears during long swipes.
 *
 * This is screen-space geometry: it never changes the world coordinates
 * used by painted paths, buildings, crops or pets.
 */
export function parkTerrainPreviewCoversViewport(
  painted: Pick<ParkTerrainViewport, "scale" | "panX" | "panY">,
  current: Pick<ParkTerrainViewport, "scale" | "panX" | "panY">,
  viewportWidth: number, viewportHeight: number,
  marginX: number, marginY: number,
): boolean {
  if (viewportWidth <= 0 || viewportHeight <= 0 || marginX <= 0 || marginY <= 0)
    return false;
  const { ratio, dx, dy } = parkTerrainPreviewTransform(painted, current, marginX, marginY);
  if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy))
    return false;
  // Canvas is initially positioned (-marginX,-marginY) and has dimensions
  // viewport + 2*margin. Its CSS transform origin is top-left.
  const left = -marginX + dx;
  const top = -marginY + dy;
  const right = left + (viewportWidth + marginX * 2) * ratio;
  const bottom = top + (viewportHeight + marginY * 2) * ratio;
  const seamGuard = 1; // cover fractional-pixel raster seams, too
  return left <= -seamGuard && top <= -seamGuard &&
    right >= viewportWidth + seamGuard && bottom >= viewportHeight + seamGuard;
}

/** Stable, unsigned coordinate hash: shifting the camera never changes a grass tuft. */
export function parkTerrainNoise(x: number, y: number, salt = 0): number {
  let hash = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
