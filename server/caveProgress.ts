export const MIN_CAVE_TIER = 1;
export const MAX_CAVE_TIER = 10;

export interface CaveProgress {
  currentTier: number;
  completedTiers: number[];
}

export function completeCaveTier(progress: CaveProgress, tier: number): CaveProgress {
  const completedTiers = Array.from(new Set([...progress.completedTiers, tier])).sort((a, b) => a - b);
  return {
    completedTiers,
    currentTier: Math.min(MAX_CAVE_TIER, Math.max(progress.currentTier, tier + 1)),
  };
}
