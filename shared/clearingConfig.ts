export const clearingRarities = ["common", "uncommon", "rare"] as const;
export type ClearingRarity = typeof clearingRarities[number];

/** The single authoritative star override used by admin validation and loot generation. */
export function effectiveClearingRarity(configured: ClearingRarity, starRarity: number | null | undefined): ClearingRarity {
  return Number(starRarity ?? 0) >= 3 ? "rare" : configured;
}

export const CLEARING_BALANCE = {
  regularExp: 5, bossExp: 20, bossHealthMultiplier: 2.5, bossDamageMultiplier: 1.25,
  bossSpawnChance: 0.05,
  regular: { itemCount: [1, 3], coins: [1, 2], essence: [0, 0], weights: { common: 72, uncommon: 26, rare: 2 } },
  boss: { itemCount: [3, 5], coins: [3, 5], essence: [10, 20], weights: { common: 25, uncommon: 65, rare: 10 } },
} as const;
