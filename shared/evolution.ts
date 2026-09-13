export const EVOLUTION_SLOT_COUNT = 6;

export const EVOLUTION_TARGET_BY_RARITY = Object.freeze({
  1: 5000,
  2: 5000,
  3: 5000,
  4: 5000,
  5: 5000,
} as const);

export const EVOLUTION_FEED_POINTS_BY_RARITY = Object.freeze({
  1: 100,
  2: 200,
  3: 400,
  4: 5000,
  5: 1500,
} as const);

export const EVOLUTION_REWARD_SLOT_COUNT = EVOLUTION_SLOT_COUNT - 1;
export const EVOLUTION_NODE_COIN_REWARD = 100;

export const EVOLUTION_STAT_REWARD_BY_RARITY = Object.freeze({
  1: 100,
  2: 150,
  3: 200,
  4: 350,
  5: 500,
} as const);

export type PetRarity = keyof typeof EVOLUTION_TARGET_BY_RARITY;

export function normalizePetRarity(value: unknown): PetRarity {
  return Math.max(1, Math.min(5, Number(value) || 1)) as PetRarity;
}

export function evolutionTargetForRarity(value: unknown): number {
  return EVOLUTION_TARGET_BY_RARITY[normalizePetRarity(value)];
}

export function evolutionFeedPointsForRarity(value: unknown): number {
  return EVOLUTION_FEED_POINTS_BY_RARITY[normalizePetRarity(value)];
}

export function evolutionStatRewardForRarity(value: unknown): number {
  return EVOLUTION_STAT_REWARD_BY_RARITY[normalizePetRarity(value)];
}

export interface EvolutionProgressResult {
  completedSlots: number;
  currentPoints: number;
  pointsRequired: number;
  percent: number;
  completedNow: number;
  isComplete: boolean;
}

/**
 * Applies feeder points to the sequential six-slot evolution track.
 * Overflow carries into the next newly-unlocked slot so a valuable feeder
 * never loses points just because it crosses a slot boundary.
 */
export function applyEvolutionPoints(
  completedSlotsInput: number,
  currentPointsInput: number,
  pointsToAddInput: number,
  targetRarity: unknown,
): EvolutionProgressResult {
  const pointsRequired = evolutionTargetForRarity(targetRarity);
  let completedSlots = Math.max(0, Math.min(EVOLUTION_SLOT_COUNT, Math.trunc(completedSlotsInput || 0)));
  let currentPoints = Math.max(0, Math.trunc(currentPointsInput || 0));
  let pointsToAdd = Math.max(0, Math.trunc(pointsToAddInput || 0));
  const startingSlots = completedSlots;

  if (completedSlots >= EVOLUTION_SLOT_COUNT) {
    return {
      completedSlots: EVOLUTION_SLOT_COUNT,
      currentPoints: 0,
      pointsRequired,
      percent: 100,
      completedNow: 0,
      isComplete: true,
    };
  }

  currentPoints += pointsToAdd;
  while (completedSlots < EVOLUTION_SLOT_COUNT && currentPoints >= pointsRequired) {
    currentPoints -= pointsRequired;
    completedSlots += 1;
  }

  if (completedSlots >= EVOLUTION_SLOT_COUNT) currentPoints = 0;
  const isComplete = completedSlots >= EVOLUTION_SLOT_COUNT;
  const percent = isComplete ? 100 : Math.max(0, Math.min(100, (currentPoints / pointsRequired) * 100));

  return {
    completedSlots,
    currentPoints,
    pointsRequired,
    percent,
    completedNow: completedSlots - startingSlots,
    isComplete,
  };
}
