import type { clearingEquipmentSlots } from "./schema";

export type ClearingEquipmentSlot = typeof clearingEquipmentSlots[number];

export interface ClearingStatTotals {
  atk: number;
  def: number;
  hp: number;
}

export interface ClearingInventoryItem {
  inventoryId: string;
  shopItemId: string;
  /** Application-stable identity; never infer identity from the display name. */
  stableKey: string;
  name: string;
  imageUrl: string | null;
  slot: ClearingEquipmentSlot;
  stars: number;
  atkBonus: number;
  defBonus: number;
  hpBonus: number;
  quantity: number;
  acquiredAt: Date;
  equipped: boolean;
  eligibleForSale: boolean;
  attackStyle?: import("./clearingCombat").ClearingAttackStyle;
}

export const CLEARING_EQUIPMENT_SALE_VALUES = { 1: 25, 2: 50, 3: 100, 4: 300, 5: 500 } as const;
export interface ClearingSaleResult { soldCount: number; essenceEarned: number; essenceBalance: number }

export type ClearingCurrency = "coins" | "essence";
export interface ClearingCurrencyDrop {
  dropId: string; currency: ClearingCurrency; amount: number;
  worldX: number; worldY: number; expiresAt: string;
}

export interface ClearingLoadout {
  helmet: ClearingInventoryItem | null;
  weapon: ClearingInventoryItem | null;
  armor: ClearingInventoryItem | null;
  boots: ClearingInventoryItem | null;
  charm: ClearingInventoryItem | null;
  totals: ClearingStatTotals;
}

export interface EffectiveClearingStats {
  hp: number;
  atk: number;
  def: number;
}

export type ClearingStarRarity = 1 | 2 | 3 | 4 | 5;

export interface ClearingGroundDrop {
  dropId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  slot: ClearingEquipmentSlot;
  stars: ClearingStarRarity;
  atkBonus: number;
  defBonus: number;
  hpBonus: number;
  worldX: number;
  worldY: number;
  expiresAt: string;
}

export interface ClearingLoadoutResponse extends ClearingLoadout {
  effectiveStats: EffectiveClearingStats | null;
}

export interface ClearingChestEquipmentReward {
  shopItemId: string; name: string; imageUrl: string | null;
  slot: ClearingEquipmentSlot; stars: ClearingStarRarity;
  atkBonus: number; defBonus: number; hpBonus: number;
}

export interface ClearingRewardBundle {
  exp: number; coins: number; essence: number;
  /** World whose current admin drop pool authorizes this chest's item rewards. */
  sourceWorldId?: string;
  items: Array<{ shopItemId:string; name:string; imageUrl:string|null; type:string; quantity:number; starRarity:number; rarity:import("./clearingConfig").ClearingRarity; slot?:string|null; atkBonus?:number; defBonus?:number; hpBonus?:number }>;
  equipment: ClearingChestEquipmentReward[];
  consumables: Array<{ shopItemId: string; name: string; imageUrl: string | null; quantity: number }>;
}

export interface ClearingRewardChest {
  chestId: string; sessionId: string; defeatedEnemyId: string;
  worldX: number; worldY: number; createdAt: string; expiresAt: string;
  claimedAt: string | null; status: "unclaimed" | "claimed";
  highestEquipmentRarity: ClearingStarRarity | 0;
  rewards: ClearingRewardBundle;
}
