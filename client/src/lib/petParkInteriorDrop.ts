/**
 * Convert a finger drop into the room's authored image coordinates.
 * The image may be much wider than the visible viewport and panned sideways.
 */
export function petParkInteriorDropPoint(
  point: { x: number; y: number },
  viewport: { left: number; top: number; width: number; height: number },
  artwork: { left: number; top: number; width: number; height: number },
): { xPct: number; yPct: number } | null {
  const valid = [point.x, point.y, viewport.left, viewport.top, viewport.width,
    viewport.height, artwork.left, artwork.top, artwork.width, artwork.height];
  if (valid.some(value => !Number.isFinite(value)) ||
      viewport.width <= 0 || viewport.height <= 0 || artwork.width <= 0 || artwork.height <= 0) return null;
  if (point.x < viewport.left || point.x > viewport.left + viewport.width ||
      point.y < viewport.top || point.y > viewport.top + viewport.height) return null;
  const xPct = (point.x - artwork.left) / artwork.width;
  const yPct = (point.y - artwork.top) / artwork.height;
  if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return null;
  return { xPct, yPct };
}
