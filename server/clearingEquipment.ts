import { and, eq, or, sql } from "drizzle-orm";
import { shopItems, userClearingLoadouts, userInventory } from "@shared/schema";
import { CLEARING_EQUIPMENT_SALE_VALUES, type ClearingEquipmentSlot, type ClearingInventoryItem, type ClearingLoadout, type ClearingStatTotals, type EffectiveClearingStats } from "@shared/clearingEquipment";
import { resolveClearingAttackStyle } from "@shared/clearingCombat";

export const BASIC_SWORD_ID = "a1b2c3d4-0011-4000-8000-000000000012";
export function chooseClearingStarterWeapon(input:{equippedId?:string|null;ownedWeapons:Array<{inventoryId:string;shopItemId:string}>}) {
  if(input.equippedId)return {grant:false,equipId:null};
  const basic=input.ownedWeapons.find(item=>item.shopItemId===BASIC_SWORD_ID);
  if(basic)return {grant:false,equipId:basic.inventoryId};
  if(input.ownedWeapons.length)return {grant:false,equipId:input.ownedWeapons[0].inventoryId};
  return {grant:true,equipId:null};
}

/** Transactional session bootstrap. The canonical item and per-user inventory
 * lookup make repeated entry idempotent; a deliberately equipped weapon wins. */
export async function ensureClearingStarterWeapon(database:any,userId:string){return database.transaction(async(tx:any)=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`clearing-starter:${userId}`}))`);
  await tx.execute(sql`INSERT INTO shop_items(id,name,price,type,world_id,location_id,image_url,clearing_slot,clearing_attack_style,clearing_active,star_rarity,atk_boost,def_boost,health_boost)
    VALUES(${BASIC_SWORD_ID},'Basic Sword',0,'clearing','swamp','a1b2c3d4-0011-4000-8000-000000000011',NULL,'weapon','sword_slash',true,1,4,0,0) ON CONFLICT(id) DO NOTHING`);
  const state=await tx.execute(sql`SELECT l.weapon_inventory_id,ui.id AS inventory_id,ui.shop_item_id FROM user_clearing_loadouts l FULL JOIN user_inventory ui ON ui.user_id=${userId} AND ui.shop_item_id IN (SELECT id FROM shop_items WHERE type='clearing' AND clearing_slot='weapon' AND clearing_active=true) WHERE l.user_id=${userId} OR ui.user_id=${userId} ORDER BY ui.acquired_at`);
  const rows=state.rows as any[],equippedId=rows.find(r=>r.weapon_inventory_id)?.weapon_inventory_id??null;
  const decision=chooseClearingStarterWeapon({equippedId,ownedWeapons:rows.filter(r=>r.inventory_id).map(r=>({inventoryId:r.inventory_id,shopItemId:r.shop_item_id}))});
  let equipId=decision.equipId;if(decision.grant){const inserted=await tx.execute(sql`INSERT INTO user_inventory(user_id,shop_item_id,quantity) SELECT ${userId},${BASIC_SWORD_ID},1 WHERE NOT EXISTS(SELECT 1 FROM user_inventory WHERE user_id=${userId} AND shop_item_id=${BASIC_SWORD_ID}) RETURNING id`);equipId=(inserted.rows[0] as any)?.id??null;if(!equipId){const existing=await tx.execute(sql`SELECT id FROM user_inventory WHERE user_id=${userId} AND shop_item_id=${BASIC_SWORD_ID} ORDER BY acquired_at LIMIT 1`);equipId=(existing.rows[0] as any)?.id;}}
  if(!equippedId&&equipId)await tx.execute(sql`INSERT INTO user_clearing_loadouts(user_id,weapon_inventory_id) VALUES(${userId},${equipId}) ON CONFLICT(user_id) DO UPDATE SET weapon_inventory_id=CASE WHEN user_clearing_loadouts.weapon_inventory_id IS NULL THEN excluded.weapon_inventory_id ELSE user_clearing_loadouts.weapon_inventory_id END,updated_at=now()`);
  return getClearingLoadout(tx,userId);
});}

export class ClearingEquipmentError extends Error {
  constructor(public code: "not_found" | "invalid_item" | "invalid_slot" | "duplicate" | "equipped", message: string) { super(message); }
}

const emptyTotals = (): ClearingStatTotals => ({ atk: 0, def: 0, hp: 0 });

function toInventoryItem(row: any, equippedIds: Set<string>): ClearingInventoryItem {
  return {
    inventoryId: row.inventoryId, shopItemId: row.shopItemId, name: row.name,
    imageUrl: row.imageUrl ?? null, slot: row.slot, stars: Number(row.stars),
    atkBonus: Number(row.atkBonus ?? 0), defBonus: Number(row.defBonus ?? 0), hpBonus: Number(row.hpBonus ?? 0),
    quantity: Number(row.quantity ?? 1), acquiredAt: row.acquiredAt, equipped: equippedIds.has(row.inventoryId), eligibleForSale: !equippedIds.has(row.inventoryId) && !row.isListed, attackStyle:resolveClearingAttackStyle({attackStyle:row.attackStyle,name:row.name}),
  };
}

const selection = {
  inventoryId: userInventory.id, shopItemId: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
  itemType: shopItems.type,
  slot: shopItems.clearingSlot, stars: shopItems.starRarity, atkBonus: shopItems.atkBoost,
  defBonus: shopItems.defBoost, hpBonus: shopItems.healthBoost, quantity: userInventory.quantity, acquiredAt: userInventory.acquiredAt, isListed:userInventory.isListed,
  attackStyle: shopItems.clearingAttackStyle,
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

export async function sellClearingEquipment(database:any,userId:string,inventoryIds:string[]){
  if(new Set(inventoryIds).size!==inventoryIds.length)throw new ClearingEquipmentError("duplicate","Duplicate equipment IDs are not allowed");
  if(!inventoryIds.length||inventoryIds.length>200)throw new ClearingEquipmentError("invalid_item","Select between 1 and 200 items");
  return database.transaction(async(tx:any)=>{
    const loadout=await getLoadoutRow(tx,userId),equipped=new Set([loadout?.weaponInventoryId,loadout?.armorInventoryId,loadout?.charmInventoryId].filter(Boolean));
    if(inventoryIds.some(id=>equipped.has(id)))throw new ClearingEquipmentError("equipped","Unequip items before selling them");
    const rows=await tx.select(selection).from(userInventory).innerJoin(shopItems,eq(userInventory.shopItemId,shopItems.id)).where(and(eq(userInventory.userId,userId),or(...inventoryIds.map(id=>eq(userInventory.id,id))))).for("update");
    if(rows.length!==inventoryIds.length)throw new ClearingEquipmentError("not_found","One or more equipment items were not found");
    let essence=0; for(const row of rows){const stars=Number(row.stars) as keyof typeof CLEARING_EQUIPMENT_SALE_VALUES;if(row.itemType!=="clearing"||row.isListed||!CLEARING_EQUIPMENT_SALE_VALUES[stars])throw new ClearingEquipmentError("invalid_item","A selected item is not eligible for sale");essence+=CLEARING_EQUIPMENT_SALE_VALUES[stars]*Number(row.quantity??1);}
    // Removal and server-calculated credit share this transaction, preventing partial sales.
    await tx.delete(userInventory).where(and(eq(userInventory.userId,userId),or(...inventoryIds.map(id=>eq(userInventory.id,id)))));
    const updated=await tx.execute(sql`UPDATE users SET essence=essence+${essence} WHERE id=${userId} RETURNING essence`);
    return {soldCount:rows.reduce((n:any,r:any)=>n+Number(r.quantity??1),0),essenceEarned:essence,essenceBalance:Number((updated.rows[0] as any).essence)};
  });
}
