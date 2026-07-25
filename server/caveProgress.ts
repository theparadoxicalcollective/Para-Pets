export const MIN_CAVE_TIER = 1;
export const MAX_CAVE_TIER = 10;

export interface CaveProgress {
  currentTier: number;
  completedTiers: number[];
}

export class CaveTierLockedError extends Error {
  constructor(public readonly tier: number) {
    super(`Cave tier ${tier} is locked`);
    this.name = "CaveTierLockedError";
  }
}

export function isCaveTierAccessible(progress: CaveProgress, tier: number): boolean {
  return tier >= MIN_CAVE_TIER
    && tier <= MAX_CAVE_TIER
    && (progress.completedTiers.includes(tier) || tier <= progress.currentTier);
}

export function completeCaveTier(progress: CaveProgress, tier: number): CaveProgress {
  if (!isCaveTierAccessible(progress, tier)) throw new CaveTierLockedError(tier);
  const completedTiers = Array.from(new Set([...progress.completedTiers, tier])).sort((a, b) => a - b);
  return {
    completedTiers,
    currentTier: Math.min(MAX_CAVE_TIER, Math.max(progress.currentTier, tier + 1)),
  };
}
