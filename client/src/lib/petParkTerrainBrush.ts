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
  existing: ParkBrushPoint[], target: ParkBrushPoint,
  world: { width: number; height: number }, brushSize: number,
  maxStamps = PARK_BRUSH_MAX_STAMPS,
): ParkBrushPoint[] {
  if (!existing.length) return [{ xPct: clamp(target.xPct), yPct: clamp(target.yPct) }];
  if (existing.length >= maxStamps) return existing;
  const last = existing[existing.length - 1];
  const dx = (target.xPct - last.xPct) * world.width;
  const dy = (target.yPct - last.yPct) * world.height;
  const distance = Math.hypot(dx, dy);
  const gap = Math.max(18, brushSize * 0.42);
  const needed = Math.min(Math.floor(distance / gap), maxStamps - existing.length);
  if (needed <= 0) return existing;
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

/** Grid centers are anchored at the park center so expansion preserves alignment. */
export function parkSnapPathPoint(point: ParkBrushPoint, world: { width: number; height: number }, size: number): ParkBrushPoint {
  const snap = (value: number, extent: number) => {
    const origin = extent / 2;
    const cell = Math.round((clamp(value) * extent - origin) / size);
    const min = Math.ceil((size / 2 - origin) / size);
    const max = Math.floor((extent - size / 2 - origin) / size);
    return (origin + Math.max(min, Math.min(max, cell)) * size) / extent;
  };
  return { xPct: snap(point.xPct, world.width), yPct: snap(point.yPct, world.height) };
}

/** Each dirt stroke is one aligned row/column; lift the pointer to make a turn. */
export function parkExtendPathStroke(
  existing: ParkBrushPoint[], target: ParkBrushPoint,
  world: { width: number; height: number }, size: number, maxStamps = PARK_BRUSH_MAX_STAMPS,
): ParkBrushPoint[] {
  const snapped = parkSnapPathPoint(target, world, size);
  if (!existing.length) return [snapped];
  if (existing.length >= maxStamps) return existing;
  const first = existing[0];
  const horizontal = existing.length > 1
    ? existing[1].xPct !== first.xPct
    : Math.abs((snapped.xPct - first.xPct) * world.width) >= Math.abs((snapped.yPct - first.yPct) * world.height);
  const axis = horizontal ? "xPct" : "yPct";
  const extent = horizontal ? world.width : world.height;
  const last = existing[existing.length - 1];
  const cells = Math.round((snapped[axis] - last[axis]) * extent / size);
  if (!cells) return existing;
  const next = [...existing];
  for (let i = 1; i <= Math.abs(cells) && next.length < maxStamps; i++) {
    const point = { ...first, [axis]: last[axis] + Math.sign(cells) * i * size / extent };
    if (!next.some(p => Math.abs(p.xPct - point.xPct) < 1e-8 && Math.abs(p.yPct - point.yPct) < 1e-8)) next.push(point);
  }
  return next;
}
