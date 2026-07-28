import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WalkableBounds } from "@/lib/exploreLocations";

export type WorldPixels = { width: number; height: number };
export type Circle = { x: number; y: number; radius: number };
export type Capsule = { from: PetWalkPos; to: PetWalkPos; radius: number };

/** Aspect-ratio preserving Clearing canvas. Height is preferred; width grows only
 * enough to cover the viewport, so there are no bars and no vertical camera pan. */
export function clearingWorldSize(viewport: WorldPixels, imageAspect: number): WorldPixels {
  const height = Math.max(1, viewport.height);
  return { width: Math.max(viewport.width, height * imageAspect), height };
}

/** Converts artwork bounds into centre-coordinate bounds that include the
 * sprite's visual radius and its feet anchor. */
export function insetMovementBounds(bounds: WalkableBounds, world: WorldPixels, spriteSize: number, feetAnchor = .8, halfWidthRatio = .36): WalkableBounds {
  const xInset = spriteSize * halfWidthRatio / world.width;
  const topInset = spriteSize * feetAnchor / world.height;
  const bottomInset = spriteSize * (1 - feetAnchor) / world.height;
  return { xMin: bounds.xMin + xInset, xMax: bounds.xMax - xInset, yMin: bounds.yMin + topInset, yMax: bounds.yMax - bottomInset };
}

export function pixelDelta(from: PetWalkPos, to: PetWalkPos, world: WorldPixels) {
  return { dx: (to.x - from.x) * world.width, dy: (to.y - from.y) * world.height };
}

export function pixelDistance(from: PetWalkPos, to: PetWalkPos, world: WorldPixels) {
  const { dx, dy } = pixelDelta(from, to, world);
  return Math.hypot(dx, dy);
}

export function stepToward(from: PetWalkPos, to: PetWalkPos, pixels: number, world: WorldPixels) {
  const { dx, dy } = pixelDelta(from, to, world);
  const distance = Math.hypot(dx, dy);
  if (!distance || distance <= pixels) return { ...to };
  return { x: from.x + (dx / distance) * pixels / world.width, y: from.y + (dy / distance) * pixels / world.height };
}

export function clampPoint(point: PetWalkPos, bounds: WalkableBounds) {
  return { x: Math.max(bounds.xMin, Math.min(bounds.xMax, point.x)), y: Math.max(bounds.yMin, Math.min(bounds.yMax, point.y)) };
}

export function cameraTarget(pet: PetWalkPos, world: WorldPixels, viewport: WorldPixels) {
  return {
    x: Math.max(0, Math.min(world.width - viewport.width, pet.x * world.width - viewport.width / 2)),
    y: Math.max(0, Math.min(world.height - viewport.height, pet.y * world.height - viewport.height / 2)),
  };
}

export function circlesIntersect(a: Circle, b: Circle) { return pixelDistance(a, b, { width: 1, height: 1 }) <= a.radius + b.radius; }

export function meleeArcHit(origin: PetWalkPos, facing: -1 | 1, target: Circle, range: number, halfAngleRadians = Math.PI / 3) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance > range + target.radius || distance === 0) return false;
  return (dx * facing) / distance >= Math.cos(halfAngleRadians);
}

export function circleHitsCapsule(circle: Circle, capsule: Capsule) {
  const dx = capsule.to.x - capsule.from.x, dy = capsule.to.y - capsule.from.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((circle.x-capsule.from.x)*dx+(circle.y-capsule.from.y)*dy)/length2)) : 0;
  return Math.hypot(circle.x-(capsule.from.x+t*dx), circle.y-(capsule.from.y+t*dy)) <= circle.radius + capsule.radius;
}
