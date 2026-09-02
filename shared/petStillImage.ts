type PetArtwork = {
  type: string;
  hatchedImageUrl?: string | null;
  evolutionImageUrl?: string | null;
};

/** Resolve an owned copy without mutating the species catalog or animated parts. */
export function withPetStillImage<T extends PetArtwork>(
  item: T,
  pet: { isHatched?: boolean; isEvolved?: boolean },
): T {
  if (item.type !== "pet" || !pet.isHatched || !pet.isEvolved || !item.evolutionImageUrl) return item;
  return { ...item, hatchedImageUrl: item.evolutionImageUrl };
}
