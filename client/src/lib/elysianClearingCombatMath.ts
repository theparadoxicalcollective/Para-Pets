import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WalkableBounds } from "@/lib/exploreLocations";
import { clearingDistanceToRay, clearingPointInDirection, normalizeClearingDirection, type ClearingDirection } from "@shared/clearingCombatGeometry";

export type WorldPixels = { width: number; height: number };
export const normalizeDirection=normalizeClearingDirection;
export const pointInDirection=clearingPointInDirection;

export type ClearingTargetCandidate<T> = {
  enemy: T;
  active: boolean;
  health: number;
  center: PetWalkPos;
  collisionRadius: number;
};
export function selectEnemyUnderAimPointer<T>(pointer:PetWalkPos,candidates:ClearingTargetCandidate<T>[],pointerRadius:number,world:WorldPixels):T|undefined{return candidates.filter(c=>c.active&&c.health>0&&Number.isFinite(c.collisionRadius)).map(candidate=>({candidate,distance:pixelDistance(pointer,candidate.center,world)})).filter(({candidate,distance})=>Number.isFinite(distance)&&distance<=pointerRadius+Math.max(0,candidate.collisionRadius)).sort((a,b)=>a.distance-b.distance)[0]?.candidate.enemy;}
export function selectFirstEnemyAlongAimCapsule<T>(origin:PetWalkPos,direction:ClearingDirection,candidates:ClearingTargetCandidate<T>[],range:number,capsuleRadius:number,world:WorldPixels):T|undefined{return candidates.filter(c=>c.active&&c.health>0).map(candidate=>({candidate,ray:clearingDistanceToRay(origin,direction,candidate.center,range,world)})).filter(({candidate,ray})=>ray&&ray.along>=0&&ray.along<=range&&ray.distance<=capsuleRadius+Math.max(0,candidate.collisionRadius)).sort((a,b)=>(a.ray?.along??Infinity)-(b.ray?.along??Infinity))[0]?.candidate.enemy;}

export function directionToClearingTarget(origin: PetWalkPos, target: PetWalkPos, world: WorldPixels) {
  const { dx, dy } = pixelDelta(origin, target, world);
  return { dx, dy, angleRadians: Math.atan2(dy, dx) };
}
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
  const width = Number.isFinite(world.width) && world.width > 1 ? world.width : 390;
  const height = Number.isFinite(world.height) && world.height > 1 ? world.height : 844;
  const size = Number.isFinite(spriteSize) ? Math.max(1, Math.min(256, spriteSize)) : 110;
  const xInset = Math.min((bounds.xMax-bounds.xMin)/2-.001, size * halfWidthRatio / width);
  const topInset = Math.min((bounds.yMax-bounds.yMin)/2-.001, size * feetAnchor / height);
  const bottomInset = Math.min((bounds.yMax-bounds.yMin)/2-.001, size * (1-feetAnchor) / height);
  return { xMin: bounds.xMin + xInset, xMax: bounds.xMax - xInset, yMin: bounds.yMin + topInset, yMax: bounds.yMax - bottomInset };
}

export function pixelDelta(from: PetWalkPos, to: PetWalkPos, world: WorldPixels) {
  const width=Number.isFinite(world.width)&&world.width>0?world.width:1,height=Number.isFinite(world.height)&&world.height>0?world.height:1;
  const fx=Number.isFinite(from.x)?from.x:0,fy=Number.isFinite(from.y)?from.y:0,tx=Number.isFinite(to.x)?to.x:fx,ty=Number.isFinite(to.y)?to.y:fy;
  return { dx:(tx-fx)*width, dy:(ty-fy)*height };
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
  const x=Number.isFinite(point.x)?point.x:(bounds.xMin+bounds.xMax)/2,y=Number.isFinite(point.y)?point.y:(bounds.yMin+bounds.yMax)/2;
  return { x:Math.max(bounds.xMin,Math.min(bounds.xMax,x)), y:Math.max(bounds.yMin,Math.min(bounds.yMax,y)) };
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
