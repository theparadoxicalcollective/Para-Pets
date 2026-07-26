import { and, eq, or } from "drizzle-orm";
import { shopItems, userClearingLoadouts, userInventory } from "@shared/schema";
import type { ClearingEquipmentSlot, ClearingInventoryItem, ClearingLoadout, ClearingStatTotals, EffectiveClearingStats } from "@shared/clearingEquipment";

export class ClearingEquipmentError extends Error {
  constructor(public code: "not_found" | "invalid_item" | "invalid_slot", message: string) { super(message); }
}

const emptyTotals = (): ClearingStatTotals => ({ atk: 0, def: 0, hp: 0 });

function toInventoryItem(row: any, equippedIds: Set<string>): ClearingInventoryItem {
  return {
    inventoryId: row.inventoryId, shopItemId: row.shopItemId, name: row.name,
    imageUrl: row.imageUrl ?? null, slot: row.slot, stars: Number(row.stars),
    atkBonus: Number(row.atkBonus ?? 0), defBonus: Number(row.defBonus ?? 0), hpBonus: Number(row.hpBonus ?? 0),
    quantity: Number(row.quantity ?? 1), acquiredAt: row.acquiredAt, equipped: equippedIds.has(row.inventoryId),
  };
}

const selection = {
  inventoryId: userInventory.id, shopItemId: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
  itemType: shopItems.type,
  slot: shopItems.clearingSlot, stars: shopItems.starRarity, atkBonus: shopItems.atkBoost,
  defBonus: shopItems.defBoost, hpBonus: shopItems.healthBoost, quantity: userInventory.quantity, acquiredAt: userInventory.acquiredAt,
};

async function getLoadoutRow(executor: any, userId: string) {
  const [row] = await executor.select().from(userClearingLoadouts).where(eq(userClearingLoadouts.userId, userId));
  return row ?? null;
}

export async function getClearingInventory(executor: any, userId: string): Promise<ClearingInventoryItem[]> {
  const loadout = await getLoadoutRow(executor, userId);
  const equippedIds = new Set<string>([loadout?.weaponInventoryId, loadout?.armorInventoryId, loadout?.charmInventoryId].filter(Boolean));
  const rows = await executor.select(selection).from(userInventory).innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
    .where(and(eq(userInventory.userId, userId), eq(shopItems.type, "clearing")));
  return rows.map((row: any) => toInventoryItem(row, equippedIds));
}

export async function getClearingLoadout(executor: any, userId: string): Promise<ClearingLoadout> {
  const row = await getLoadoutRow(executor, userId);
  const equippedIds = new Set<string>([row?.weaponInventoryId, row?.armorInventoryId, row?.charmInventoryId].filter(Boolean));
  const items = equippedIds.size ? await executor.select(selection).from(userInventory).innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
    .where(and(eq(userInventory.userId, userId), or(...[...equippedIds].map(id => eq(userInventory.id, id))))) : [];
  const byId = new Map<string, ClearingInventoryItem>(items
    .filter((item: any) => item.itemType === "clearing")
    .map((item: any) => [item.inventoryId, toInventoryItem(item, equippedIds)]));
  const validEquipped = (inventoryId: string | null | undefined, expectedSlot: ClearingEquipmentSlot) => {
    const item = inventoryId ? byId.get(inventoryId) : null;
    return item?.slot === expectedSlot ? item : null;
  };
  const result: ClearingLoadout = {
    weapon: validEquipped(row?.weaponInventoryId, "weapon"),
    armor: validEquipped(row?.armorInventoryId, "armor"),
    charm: validEquipped(row?.charmInventoryId, "charm"),
    totals: emptyTotals(),
  };
  for (const item of [result.weapon, result.armor, result.charm]) if (item) {
    result.totals.atk += item.atkBonus; result.totals.def += item.defBonus; result.totals.hp += item.hpBonus;
  }
  return result;
}

export async function equipClearingItem(database: any, userId: string, inventoryId: string): Promise<ClearingLoadout> {
  return database.transaction(async (tx: any) => {
    const [item] = await tx.select(selection).from(userInventory).innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
      .where(and(eq(userInventory.id, inventoryId), eq(userInventory.userId, userId))).for("update");
    if (!item) throw new ClearingEquipmentError("not_found", "Inventory item was not found");
    const slot = validateClearingEquipCandidate(item);
    const values = slot === "weapon" ? { userId, weaponInventoryId: inventoryId } : slot === "armor" ? { userId, armorInventoryId: inventoryId } : { userId, charmInventoryId: inventoryId };
    const set = slot === "weapon" ? { weaponInventoryId: inventoryId, updatedAt: new Date() } : slot === "armor" ? { armorInventoryId: inventoryId, updatedAt: new Date() } : { charmInventoryId: inventoryId, updatedAt: new Date() };
    await tx.insert(userClearingLoadouts).values(values).onConflictDoUpdate({ target: userClearingLoadouts.userId, set });
    return getClearingLoadout(tx, userId);
  });
}

export async function unequipClearingItem(database: any, userId: string, slot: ClearingEquipmentSlot): Promise<ClearingLoadout> {
  if (slot !== "weapon" && slot !== "armor" && slot !== "charm") throw new ClearingEquipmentError("invalid_slot", "Clearing slot must be weapon, armor, or charm");
  return database.transaction(async (tx: any) => {
    const field = slot === "weapon" ? "weaponInventoryId" : slot === "armor" ? "armorInventoryId" : "charmInventoryId";
    await tx.insert(userClearingLoadouts).values({ userId, [field]: null }).onConflictDoUpdate({ target: userClearingLoadouts.userId, set: { [field]: null, updatedAt: new Date() } });
    return getClearingLoadout(tx, userId);
  });
}

export function calculateClearingStats(base: EffectiveClearingStats, bonuses: ClearingStatTotals): EffectiveClearingStats {
  return { hp: base.hp + bonuses.hp, atk: base.atk + bonuses.atk, def: base.def + bonuses.def };
}

export function validateClearingEquipCandidate(item: { itemType: string; slot: unknown }): ClearingEquipmentSlot {
  if (item.itemType !== "clearing" || (item.slot !== "weapon" && item.slot !== "armor" && item.slot !== "charm")) {
    throw new ClearingEquipmentError("invalid_item", "Item is not valid clearing equipment");
  }
  return item.slot;
}
