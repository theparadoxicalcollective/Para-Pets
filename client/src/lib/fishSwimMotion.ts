// The catalog, not the placed/caught instance, identifies the fish species.
// These rules are shared by the authored world tracks and live aquarium motion.
export type FishMotionTraits = {
  starRarity?: number | null;
  facingDirection?: string | null;
  fishSwimZone?: string | null;
};

export const FISH_BOTTOM_MIN = .90;
export const FISH_BOTTOM_MAX = 1;
export const isBottomFish = (fish: FishMotionTraits) => fish.fishSwimZone === "bottom";

export function fishRarityScale(rarity: number | null | undefined) {
  return rarity === 5 ? 1.45 : rarity === 4 ? 1.30 : rarity === 3 ? 1.15 : 1;
}

export function fishArtFacingScale(facingDirection: string | null | undefined, movingRight: boolean): 1 | -1 {
  return (facingDirection !== "left") === movingRight ? 1 : -1;
}

export function fishSchoolKey(speciesId: string, fish: FishMotionTraits): string | null {
  // Large/rare fish stay out of schools. Null/legacy rarity behaves as one star.
  return (fish.starRarity ?? 1) < 3 ? speciesId + ":" + (isBottomFish(fish) ? "bottom" : "full") : null;
}

export const clampFish = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Reproducible across camera moves, React renders, and editor/player views. */
export function fishSeed(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function fishRandom(key: string) {
  let seed = fishSeed(key);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
