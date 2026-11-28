import { decorAllowsWalking } from "@shared/decorSurface";
import { worldSceneRotatedSquareExtent, type WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import { worldEditorClampCamera } from "./worldEditorCamera";

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Sampler = (x: number, y: number) => boolean;
export const WORLD_AVATAR_SIZE = 190;
export const WORLD_WALK_SPEED = 240; // authored units/second, independent of map tier and zoom
const CELL = 240;
const STEP = 3;
const FOOT_MARGIN = 12;
export const WORLD_WALK_SPAWN = { x: .5, y: .5 };

export function worldWalkBounds(world: Size) {
  return { xMin: FOOT_MARGIN / world.width, xMax: 1 - FOOT_MARGIN / world.width,
    yMin: FOOT_MARGIN / world.height, yMax: 1 - FOOT_MARGIN / world.height };
}

/** Index only traversal-affecting placements, once per scene revision. Samples
 * use authored coordinates, not DOM measurements, so panning/zooming never
 * changes the collision footprint. Missing masks conservatively block until
 * the already-visible artwork loads; no extra image request is made. */
export function worldWalkCollision(placements: readonly WorldScenePlacement[], world: Size,
  samplerFor: (placement: WorldScenePlacement) => Sampler | undefined) {
  const cells = new Map<string, WorldScenePlacement[]>();
  const key = (x: number, y: number) => Math.floor(x / CELL) + ":" + Math.floor(y / CELL);
  for (const p of placements) {
    if (p.kind !== "building" && p.kind !== "decor" &&
        !(p.kind === "terrain" && p.effectType === "water_path")) continue;
    if (p.kind === "decor" && decorAllowsWalking(p) && p.decorSurface !== "ground") continue;
    const radius = worldSceneRotatedSquareExtent(p.size, p.rotation) / 2;
    for (let x = Math.floor((p.xPct * world.width - radius) / CELL); x <= Math.floor((p.xPct * world.width + radius) / CELL); x++)
      for (let y = Math.floor((p.yPct * world.height - radius) / CELL); y <= Math.floor((p.yPct * world.height + radius) / CELL); y++) {
        const k = x + ":" + y;
        const bucket = cells.get(k);
        if (bucket) bucket.push(p); else cells.set(k, [p]);
      }
  }
  const bounds = worldWalkBounds(world);
  return (point: Point) => {
    if (point.x < bounds.xMin || point.x > bounds.xMax || point.y < bounds.yMin || point.y > bounds.yMax) return true;
    const x = point.x * world.width, y = point.y * world.height;
    let water = false, ground = false;
    for (const p of cells.get(key(x, y)) ?? []) {
      const dx = x - p.xPct * world.width, dy = y - p.yPct * world.height;
      if (p.kind === "terrain") {
        if (Math.abs(dx) / (p.size / 2) + Math.abs(dy) / (p.size / 4) <= 1) water = true;
        continue;
      }
      const r = (p.rotation ?? 0) * Math.PI / 180;
      const u = .5 + (dx * Math.cos(r) + dy * Math.sin(r)) / p.size;
      const v = .5 + (-dx * Math.sin(r) + dy * Math.cos(r)) / p.size;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const sample = samplerFor(p);
      const passable = p.kind === "decor" && decorAllowsWalking(p);
      if (passable) {
        if (p.decorSurface === "ground" && sample?.(p.flipped ? 1 - u : u, v)) ground = true;
      } else if (!sample || sample(p.flipped ? 1 - u : u, v)) return true;
    }
    return water && !ground;
  };
}

/** Small intermediate steps prevent crossing a thin fence after a slow frame.
 * Axis sliding lets a diagonal drag glide along an edge instead of sticking. */
export function worldWalkStep(from: Point, attempted: Point, world: Size, blocked: (p: Point) => boolean) {
  const dx = (attempted.x - from.x) * WORLD_WALK_SPEED;
  const dy = (attempted.y - from.y) * WORLD_WALK_SPEED;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP));
  let current = from;
  for (let i = 0; i < count; i++) {
    const x = dx / count / world.width, y = dy / count / world.height;
    const next = { x: current.x + x, y: current.y + y };
    if (!blocked(next)) current = next;
    else {
      const horizontal = { x: next.x, y: current.y };
      if (!blocked(horizontal)) current = horizontal;
      const vertical = { x: current.x, y: next.y };
      if (!blocked(vertical)) current = vertical;
    }
  }
  return current;
}

export function worldWalkSpawn(world: Size, blocked: (p: Point) => boolean) {
  if (!blocked(WORLD_WALK_SPAWN)) return WORLD_WALK_SPAWN;
  // Start in the nearest clear ring around the original centered camera.
  for (let radius = 30; radius < Math.hypot(world.width, world.height) / 2 + 30; radius += 30) {
    for (let angle = 0; angle < 16; angle++) {
      const point = { x: .5 + Math.cos(angle * Math.PI / 8) * radius / world.width,
        y: .5 + Math.sin(angle * Math.PI / 8) * radius / world.height };
      if (!blocked(point)) return point;
    }
  }
  return WORLD_WALK_SPAWN;
}

/** Keep the character in the central portion of the viewport; stop following
 * at world edges. No spring or second animation loop competes with walking. */
export function worldWalkCameraPan(position: Point, pan: Point,
  camera: { sceneWidth: number; sceneHeight: number; limitX: number; limitY: number }, viewport: Size) {
  const follow = (pixel: number, offset: number, extent: number) => {
    const screen = pixel + offset;
    return screen < extent * .35 ? extent * .35 - pixel :
      screen > extent * .65 ? extent * .65 - pixel : offset;
  };
  return worldEditorClampCamera({ x: follow(position.x * camera.sceneWidth, pan.x, viewport.width),
    y: follow(position.y * camera.sceneHeight, pan.y, viewport.height) }, camera, viewport);
}
