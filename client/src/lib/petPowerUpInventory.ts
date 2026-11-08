import type { PowerUpItem } from "@/components/powerup/PowerUpModalTypes";

/**
 * Shared between the existing Home Power Up modal and the upcoming
 * inventory-targeted route. Shop-item duplicates are displayed as one stack,
 * but consumption always sends an actual owned inventory-row ID.
 */
export function getPetPowerUpItems(inventory: readonly PowerUpItem[]): {
  powerUpItems: PowerUpItem[];
  specialItems: PowerUpItem[];
} {
  function collect(predicate: (item: PowerUpItem) => boolean): PowerUpItem[] {
    const byShopItem = new Map<string, PowerUpItem>();
    for (const item of inventory) {
      if (!predicate(item)) continue;
      const existing = byShopItem.get(item.shopItemId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        byShopItem.set(item.shopItemId, { ...item });
      }
    }
    return [...byShopItem.values()];
  }
  return {
    powerUpItems: collect((item) => item.type === "power_up" && item.statBoostType !== "lvl"),
    specialItems: collect((item) => item.type === "special" && item.specialType === "fill_evolution_node"),
  };
}

export function remainingPetPowerUpSlots(
  rarity: number | null | undefined,
  level: number | null | undefined,
  itemsUsedThisLevel: number | null | undefined,
): number {
  const slotsPerLevel = (rarity ?? 1) <= 2 ? 1 : rarity === 3 ? 2 : 3;
  return Math.max(0, Math.max(1, level ?? 1) * slotsPerLevel - Math.max(0, itemsUsedThisLevel ?? 0));
}
