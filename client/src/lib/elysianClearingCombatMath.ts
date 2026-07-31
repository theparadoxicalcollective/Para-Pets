import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WalkableBounds } from "@/lib/exploreLocations";
import { CLEARING_AIM_GEOMETRY, clearingDistanceToRay, clearingHitboxEdgeDistance, clearingPointInDirection, normalizeClearingDirection, type ClearingDirection } from "@shared/clearingCombatGeometry";

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
export type ClearingTargetQualification<T> = { enemy:T; centerDistance:number; edgeDistance:number; direction:ClearingDirection; alignment:number; directlyInStrikeRange:boolean; onlyWithinAssistRange:boolean };
export const authoritativePetGroundPosition=(position:PetWalkPos)=>({x:position.x,y:position.y});
export const authoritativeEnemyGroundPosition=<T extends PetWalkPos>(enemy:T)=>({x:enemy.x,y:enemy.y});
export const visualPetWeaponOrigin=(position:PetWalkPos,petSize:number,world:WorldPixels)=>({x:position.x,y:position.y-petSize*.45/world.height});
export const visualEnemyAimPoint=(position:PetWalkPos,visibleHeight:number,world:WorldPixels)=>({x:position.x,y:position.y-visibleHeight*.45/world.height});
export const hitboxEdgeDistance=clearingHitboxEdgeDistance;
export function selectEnemyUnderAimPointer<T>(pointer:PetWalkPos,candidates:ClearingTargetCandidate<T>[],pointerRadius:number,world:WorldPixels):T|undefined{return candidates.filter(c=>c.active&&c.health>0&&Number.isFinite(c.collisionRadius)).map(candidate=>({candidate,distance:pixelDistance(pointer,candidate.center,world)})).filter(({candidate,distance})=>Number.isFinite(distance)&&distance<=pointerRadius+Math.max(0,candidate.collisionRadius)).sort((a,b)=>a.distance-b.distance)[0]?.candidate.enemy;}
export function selectFirstEnemyAlongAimCapsule<T>(origin:PetWalkPos,direction:ClearingDirection,candidates:ClearingTargetCandidate<T>[],range:number,capsuleRadius:number,world:WorldPixels):T|undefined{return candidates.filter(c=>c.active&&c.health>0).map(candidate=>({candidate,ray:clearingDistanceToRay(origin,direction,candidate.center,range,world)})).filter(({candidate,ray})=>ray&&ray.along>=0&&ray.along<=range&&ray.distance<=capsuleRadius+Math.max(0,candidate.collisionRadius)).sort((a,b)=>(a.ray?.along??Infinity)-(b.ray?.along??Infinity))[0]?.candidate.enemy;}
export function selectMeleeAimAssistTarget<T>(origin:PetWalkPos,direction:ClearingDirection,candidates:ClearingTargetCandidate<T>[],world:WorldPixels,assistRadius=190,preferredConeDegrees=120,fallbackRadius=155):T|undefined{const n=normalizeDirection(direction);if(!n)return undefined;const scored=candidates.filter(c=>c.active&&c.health>0).map(candidate=>{const delta=pixelDelta(origin,candidate.center,world),centerDistance=Math.hypot(delta.dx,delta.dy),edgeDistance=Math.max(0,centerDistance-Math.max(0,candidate.collisionRadius)),alignment=centerDistance?((delta.dx*n.dx+delta.dy*n.dy)/centerDistance):1;return{candidate,edgeDistance,alignment};}).filter(x=>x.edgeDistance<=assistRadius);const preferred=scored.filter(x=>x.alignment>=Math.cos(preferredConeDegrees*Math.PI/360)).sort((a,b)=>(b.alignment-a.alignment)*80+(a.edgeDistance-b.edgeDistance));return (preferred[0]??scored.filter(x=>x.edgeDistance<=fallbackRadius).sort((a,b)=>a.edgeDistance-b.edgeDistance)[0])?.candidate.enemy;}

export function resolveMeleeTarget<T extends {instanceId:string}>(origin:PetWalkPos,direction:ClearingDirection,candidates:ClearingTargetCandidate<T>[],world:WorldPixels,lockedInstanceId:string|null=null):ClearingTargetQualification<T>|undefined {
  const aim=normalizeDirection(direction)??{dx:1,dy:0};
  const scored=candidates.filter(candidate=>candidate.active&&candidate.health>0).map(candidate=>{const delta=pixelDelta(origin,candidate.center,world),centerDistance=Math.hypot(delta.dx,delta.dy),edgeDistance=Math.max(0,centerDistance-Math.max(0,candidate.collisionRadius)),targetDirection=normalizeDirection(delta)??aim,alignment=centerDistance?(delta.dx*aim.dx+delta.dy*aim.dy)/centerDistance:1;return{enemy:candidate.enemy,centerDistance,edgeDistance,direction:targetDirection,alignment,directlyInStrikeRange:edgeDistance<=CLEARING_AIM_GEOMETRY.meleeAttackRangePixels+(candidate.enemy.instanceId===lockedInstanceId?CLEARING_AIM_GEOMETRY.meleeLockHysteresisPixels:0),onlyWithinAssistRange:edgeDistance>CLEARING_AIM_GEOMETRY.meleeAttackRangePixels};}).filter(result=>result.edgeDistance<=(result.enemy.instanceId===lockedInstanceId?CLEARING_AIM_GEOMETRY.meleeDisengageRangePixels:CLEARING_AIM_GEOMETRY.meleeTargetAssistRadiusPixels));
  const locked=lockedInstanceId?scored.find(result=>result.enemy.instanceId===lockedInstanceId):undefined;if(locked)return locked;
  const cone=Math.cos(CLEARING_AIM_GEOMETRY.meleePreferredConeDegrees*Math.PI/360),compare=(a:ClearingTargetQualification<T>,b:ClearingTargetQualification<T>)=>Number(b.directlyInStrikeRange)-Number(a.directlyInStrikeRange)||b.alignment-a.alignment||a.edgeDistance-b.edgeDistance||a.enemy.instanceId.localeCompare(b.enemy.instanceId);
  return scored.filter(result=>result.alignment>=cone).sort(compare)[0]??scored.filter(result=>result.edgeDistance<=CLEARING_AIM_GEOMETRY.meleeFallbackRadiusPixels).sort((a,b)=>Number(b.directlyInStrikeRange)-Number(a.directlyInStrikeRange)||a.edgeDistance-b.edgeDistance||a.enemy.instanceId.localeCompare(b.enemy.instanceId))[0];
}

export function directionToClearingTarget(origin: PetWalkPos, target: PetWalkPos, world: WorldPixels) {
  const { dx, dy } = pixelDelta(origin, target, world);
  return { dx, dy, angleRadians: Math.atan2(dy, dx) };
}
export function resolveLockedClearingTarget<T extends {instanceId:string}>(lockedInstanceId:string|null,candidates:ClearingTargetCandidate<T>[],acquire:()=>T|undefined):T|undefined {
  if (lockedInstanceId) return candidates.find(candidate=>candidate.active&&candidate.health>0&&candidate.enemy.instanceId===lockedInstanceId)?.enemy;
  return acquire();
}

export function weaponPointerPosition(origin:PetWalkPos,direction:ClearingDirection,world:WorldPixels,distancePixels:number) {
  return pointInDirection(origin,direction,Math.max(0,distancePixels),world);
}

export function weaponPointerRotation(direction:ClearingDirection,artOffsetDegrees:number) {
  const normalized=normalizeDirection(direction);
  return normalized ? Math.atan2(normalized.dy,normalized.dx)+artOffsetDegrees*Math.PI/180 : artOffsetDegrees*Math.PI/180;
}
/** Training Sword artwork's blade points up (-90deg in CSS coordinates). */
export function weaponArtOffsetForStyle(style:"sword_slash"|"staff_orb"|"default_melee"){return style==="staff_orb"?0:90;}
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
