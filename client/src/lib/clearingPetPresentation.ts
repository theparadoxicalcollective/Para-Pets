import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WorldPixels } from "@/lib/elysianClearingCombatMath";

/** Clearing-only presentation geometry. Gameplay hit areas intentionally do not
 * scale one-for-one with the transparent sprite canvas. */
export const CLEARING_PET_PRESENTATION = {
  responsiveSize: { min: 96, preferredVw: 29, max: 126, viewportHeightRatio: .17 },
  feetAnchor: .82,
  visualHalfWidthRatio: .34,
  hurtboxRadiusPixels: 26,
  weaponOrigin: { forwardRatio: .25, upRatio: .48 },
  projectileOrigin: { forwardRatio: .28, upRatio: .48 },
} as const;

export function clearingPetSize(viewport: WorldPixels): number {
  const c = CLEARING_PET_PRESENTATION.responsiveSize;
  const width = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 390;
  const height = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 844;
  return Math.max(c.min, Math.min(c.max, width * c.preferredVw / 100, height * c.viewportHeightRatio));
}

export function clearingPetHurtboxRadius(_spriteSize?: number): number {
  return CLEARING_PET_PRESENTATION.hurtboxRadiusPixels;
}

function origin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean, config: {forwardRatio:number;upRatio:number}) {
  const safeSize = Number.isFinite(spriteSize) ? Math.max(96, Math.min(126, spriteSize)) : 110;
  const width = Number.isFinite(world.width) && world.width >= 1 ? world.width : 390;
  const height = Number.isFinite(world.height) && world.height >= 1 ? world.height : 844;
  const x = Number.isFinite(pet.x) ? pet.x : .5;
  const y = Number.isFinite(pet.y) ? pet.y : .65;
  const direction = facingLeft ? -1 : 1;
  return { x: x + direction * safeSize * config.forwardRatio / width, y: y - safeSize * config.upRatio / height };
}

export function clearingWeaponOrigin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean) {
  return origin(pet, spriteSize, world, facingLeft, CLEARING_PET_PRESENTATION.weaponOrigin);
}

/** Future staff/projectile art shares the scaled pet's deliberate hand anchor. */
export function clearingProjectileOrigin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean) {
  return origin(pet, spriteSize, world, facingLeft, CLEARING_PET_PRESENTATION.projectileOrigin);
}
