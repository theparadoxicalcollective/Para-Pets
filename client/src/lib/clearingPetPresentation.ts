import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WorldPixels } from "@/lib/elysianClearingCombatMath";

/** Clearing-only presentation geometry. Gameplay hit areas intentionally do not
 * scale one-for-one with the transparent sprite canvas. */
export const CLEARING_PET_PRESENTATION = {
  responsiveSize: { min: 164, preferredVw: 43, max: 198, viewportHeightRatio: .235 },
  feetAnchor: .82,
  visualHalfWidthRatio: .34,
  hurtboxRadiusRatio: .22,
  weaponOrigin: { forwardRatio: .2, upRatio: .57 },
  projectileOrigin: { forwardRatio: .28, upRatio: .48 },
} as const;

export function clearingPetSize(viewport: WorldPixels): number {
  const c = CLEARING_PET_PRESENTATION.responsiveSize;
  return Math.max(c.min, Math.min(c.max, viewport.width * c.preferredVw / 100, viewport.height * c.viewportHeightRatio));
}

export function clearingPetHurtboxRadius(spriteSize: number): number {
  return spriteSize * CLEARING_PET_PRESENTATION.hurtboxRadiusRatio;
}

function origin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean, config: {forwardRatio:number;upRatio:number}) {
  const direction = facingLeft ? -1 : 1;
  return { x: pet.x + direction * spriteSize * config.forwardRatio / world.width, y: pet.y - spriteSize * config.upRatio / world.height };
}

export function clearingWeaponOrigin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean) {
  return origin(pet, spriteSize, world, facingLeft, CLEARING_PET_PRESENTATION.weaponOrigin);
}

/** Future staff/projectile art shares the scaled pet's deliberate hand anchor. */
export function clearingProjectileOrigin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean) {
  return origin(pet, spriteSize, world, facingLeft, CLEARING_PET_PRESENTATION.projectileOrigin);
}
