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

/** Square ground cells projected as 2:1 diamonds around the park center. */
export function parkPathGrid(point: ParkBrushPoint, world: { width: number; height: number }, size: number) {
  const x = (point.xPct - 0.5) * world.width / size;
  const y = (point.yPct - 0.5) * world.height / size;
  return { u: x + 2 * y, v: -x + 2 * y };
}
export function parkPathPoint(grid: { u: number; v: number }, world: { width: number; height: number }, size: number): ParkBrushPoint {
  return { xPct: 0.5 + (grid.u - grid.v) * size / (2 * world.width), yPct: 0.5 + (grid.u + grid.v) * size / (4 * world.height) };
}
function pathFits(point: ParkBrushPoint, world: { width: number; height: number }, size: number) {
  const x = point.xPct * world.width, y = point.yPct * world.height;
  return x >= size / 2 - 1e-7 && x <= world.width - size / 2 + 1e-7
    && y >= size / 4 - 1e-7 && y <= world.height - size / 4 + 1e-7;
}
/** Snapping never changes the camera or any saved sprite coordinate system. */
export function parkSnapPathPoint(point: ParkBrushPoint, world: { width: number; height: number }, size: number): ParkBrushPoint {
  const bounded = {
    xPct: Math.max(size / 2, Math.min(world.width - size / 2, point.xPct * world.width)) / world.width,
    yPct: Math.max(size / 4, Math.min(world.height - size / 4, point.yPct * world.height)) / world.height,
  };
  const grid = parkPathGrid(bounded, world, size);
  const u = Math.round(grid.u), v = Math.round(grid.v);
  const rounded = parkPathPoint({ u, v }, world, size);
  if (pathFits(rounded, world, size)) return rounded;
  let nearest = { xPct: 0.5, yPct: 0.5 }, distance = Infinity;
  for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
    const candidate = parkPathPoint({ u: u + du, v: v + dv }, world, size);
    if (!pathFits(candidate, world, size)) continue;
    const d = ((candidate.xPct - bounded.xPct) * world.width) ** 2 + ((candidate.yPct - bounded.yPct) * world.height) ** 2;
    if (d < distance) { nearest = candidate; distance = d; }
  }
  return nearest;
}
/** A stroke follows one slanted grid axis; lift the pointer to make a turn. */
export function parkExtendPathStroke(
  existing: ParkBrushPoint[], target: ParkBrushPoint,
  world: { width: number; height: number }, size: number, maxStamps = PARK_BRUSH_MAX_STAMPS,
): ParkBrushPoint[] {
  const snapped = parkSnapPathPoint(target, world, size);
  if (!existing.length) return [snapped];
  if (existing.length >= maxStamps) return existing;
  const grid = (point: ParkBrushPoint) => {
    const p = parkPathGrid(point, world, size);
    return { u: Math.round(p.u), v: Math.round(p.v) };
  };
  const first = grid(existing[0]), end = grid(snapped), last = grid(existing[existing.length - 1]);
  const axis = existing.length > 1
    ? (grid(existing[1]).u !== first.u ? "u" : "v")
    : (Math.abs(end.u - first.u) >= Math.abs(end.v - first.v) ? "u" : "v");
  const cells = end[axis] - last[axis];
  if (!cells) return existing;
  const next = [...existing];
  const seen = new Set(existing.map(p => { const g = grid(p); return g.u + ":" + g.v; }));
  for (let i = 1; i <= Math.abs(cells) && next.length < maxStamps; i++) {
    const g = { ...first, [axis]: last[axis] + Math.sign(cells) * i };
    const point = parkPathPoint(g, world, size);
    if (!pathFits(point, world, size)) break;
    const key = g.u + ":" + g.v;
    if (!seen.has(key)) { next.push(point); seen.add(key); }
  }
  return next;
}
