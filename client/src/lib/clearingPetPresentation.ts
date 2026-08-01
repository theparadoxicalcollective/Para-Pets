import type { PetWalkPos } from "@/hooks/usePetWalkController";
import type { WorldPixels } from "@/lib/elysianClearingCombatMath";

/** Clearing-only presentation geometry. Gameplay hit areas intentionally do not
 * scale one-for-one with the transparent sprite canvas. */
export const CLEARING_PET_PRESENTATION = {
  petEnemyVisualRatio: .68,
  standardEnemyVisibleHeight: 70,
  feetAnchor: .82,
  visualHalfWidthRatio: .34,
  hurtboxRadiusPixels: 26,
  weaponOrigin: { forwardRatio: .15, upRatio: .33 },
  projectileOrigin: { forwardRatio: .28, upRatio: .48 },
} as const;

export function clearingPetSize(viewport: WorldPixels): number {
  const portraitPhone = viewport.height > viewport.width && viewport.width <= 480;
  return CLEARING_PET_PRESENTATION.standardEnemyVisibleHeight * (portraitPhone ? CLEARING_PET_PRESENTATION.petEnemyVisualRatio : .76);
}

export function clearingPetHurtboxRadius(_spriteSize?: number): number {
  return CLEARING_PET_PRESENTATION.hurtboxRadiusPixels;
}

function origin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean, config: {forwardRatio:number;upRatio:number}) {
  const safeSize = Number.isFinite(spriteSize) ? Math.max(40, Math.min(90, spriteSize)) : 59.5;
  const width = Number.isFinite(world.width) && world.width >= 1 ? world.width : 390;
  const height = Number.isFinite(world.height) && world.height >= 1 ? world.height : 844;
  const x = Number.isFinite(pet.x) ? pet.x : .5;
  const y = Number.isFinite(pet.y) ? pet.y : .65;
  const direction = facingLeft ? -1 : 1;
  return { x: x + direction * safeSize * config.forwardRatio / width, y: y - safeSize * config.upRatio / height };
}

export function clearingWeaponOrigin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, _facingLeft: boolean) {
  // Weapon aiming changes rotation, not the hand/body anchor. Keeping this on
  // the pet art's foreground side prevents the weapon orbiting through its body.
  return origin(pet, spriteSize, world, false, CLEARING_PET_PRESENTATION.weaponOrigin);
}

/** Future staff/projectile art shares the scaled pet's deliberate hand anchor. */
export function clearingProjectileOrigin(pet: PetWalkPos, spriteSize: number, world: WorldPixels, facingLeft: boolean) {
  return origin(pet, spriteSize, world, facingLeft, CLEARING_PET_PRESENTATION.projectileOrigin);
}
