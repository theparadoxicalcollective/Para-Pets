import type { ShopItem } from "@shared/schema";

export interface FishBagRecord {
  id: string;
  shopItemId: string;
  caughtAt: string;
  inAquarium: boolean;
  item: ShopItem | null;
}

/** Adapt owned, unplaced fish to the existing bag card/detail renderer. Fish
 * IDs remain canonical; they must never go to generic inventory mutations. */
export function fishBagItems(records: FishBagRecord[]) {
  return records.flatMap(fish => !fish.item || fish.inAquarium ? [] : [{
    ...fish.item,
    inventoryId: fish.id, shopItemId: fish.shopItemId, acquiredAt: fish.caughtAt,
    type: "fishing", fishingType: "fish", rarity: fish.item.starRarity,
    isListed: false, quantity: 1,
    petNickname: null, hatchStartedAt: null, isHatched: false,
    petHealth: 0, petAtk: 0, petDef: 0, petLevel: 0,
    petLevelPoints: 0, itemsUsedThisLevel: 0,
  }]);
}
