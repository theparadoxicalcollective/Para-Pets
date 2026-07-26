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
}

export interface ClearingLoadout {
  weapon: ClearingInventoryItem | null;
  armor: ClearingInventoryItem | null;
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
