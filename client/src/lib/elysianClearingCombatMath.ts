import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WalkableBounds } from "@/lib/exploreLocations";

export type WorldPixels = { width: number; height: number };

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
