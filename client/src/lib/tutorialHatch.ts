interface HatchPet {
  isHatched?: boolean | null;
  starRarity?: number | null;
  rarity?: number | null;
}

// The starter catalog and completion endpoint both use star_rarity first.
export function isHatchedThreeStarPet(pet: HatchPet | null | undefined): boolean {
  return pet?.isHatched === true && Number(pet.starRarity ?? pet.rarity) === 3;
}
