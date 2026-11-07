/** Player Pet Park outdoor scene only. Saved coordinates, rest-area sizing,
 * indoor art and equipped slot portraits remain untouched. */
export const PARK_OUTDOOR_PET_SIZE_RATIO = 0.8;

/** On a zoomed-out park, the public roster can contain dozens of pets.
 * Use the existing static PetAnimator mode for visitors instead of running
 * dozens of full part and mini-pet animations. The owner's pet keeps moving.
 */
export const PARK_OUTDOOR_QUIET_ZOOM = 0.85;

export function parkOutdoorPetSize(worldSize: number): number {
  return worldSize * PARK_OUTDOOR_PET_SIZE_RATIO;
}

export function animateParkOutdoorPet(zoom: number, reducedMotion: boolean, isMine: boolean): boolean {
  return !reducedMotion && (isMine || zoom > PARK_OUTDOOR_QUIET_ZOOM);
}
