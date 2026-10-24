/** A terrain brush uses the same normalized coordinates as existing park objects. */
export type ParkBrushPoint = { xPct: number; yPct: number };
export const PARK_BRUSH_MAX_STAMPS = 60;

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

/** Convert a pointer in CSS client pixels into the camera's live world coordinates.
 * Accounts for a CSS-scaled parent, as used by the game's portrait desktop frame. */
export function parkBrushWorldPoint(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  camera: { x: number; y: number },
  scene: { width: number; height: number },
): ParkBrushPoint {
  const localX = (clientX - rect.left) * viewport.width / Math.max(1, rect.width);
  const localY = (clientY - rect.top) * viewport.height / Math.max(1, rect.height);
  return {
    xPct: clamp((localX - camera.x) / Math.max(1, scene.width)),
    yPct: clamp((localY - camera.y) / Math.max(1, scene.height)),
  };
}

/** Space stamps in world units, not screen pixels. One fast drag cannot create
 * unbounded items and different screen sizes or zoom levels yield the same trail. */
export function parkExtendBrushStroke(
  existing: readonly ParkBrushPoint[], target: ParkBrushPoint,
  world: { width: number; height: number }, brushSize: number,
  maxStamps = PARK_BRUSH_MAX_STAMPS,
): ParkBrushPoint[] {
  if (!existing.length) return [{ xPct: clamp(target.xPct), yPct: clamp(target.yPct) }];
  if (existing.length >= maxStamps) return [...existing];
  const last = existing[existing.length - 1];
  const dx = (target.xPct - last.xPct) * world.width;
  const dy = (target.yPct - last.yPct) * world.height;
  const distance = Math.hypot(dx, dy);
  const gap = Math.max(18, brushSize * 0.42);
  const needed = Math.min(Math.floor(distance / gap), maxStamps - existing.length);
  if (needed <= 0) return [...existing];
  const next = [...existing];
  for (let i = 1; i <= needed; i++) {
    const portion = Math.min(1, (i * gap) / distance);
    next.push({
      xPct: clamp(last.xPct + (target.xPct - last.xPct) * portion),
      yPct: clamp(last.yPct + (target.yPct - last.yPct) * portion),
    });
  }
  return next;
}
