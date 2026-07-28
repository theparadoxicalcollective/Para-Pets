import { sql } from "drizzle-orm";
import type { ClearingEquipmentSlot, ClearingGroundDrop, ClearingStarRarity } from "@shared/clearingEquipment";

export const CLEARING_LOOT = {
  equipmentChance: 0.06,
  rarityWeights: [55, 28, 12, 4, 1] as const,
  expirationMs: 5 * 60_000,
  pickupRadiusPixels: 76,
} as const;

export type RandomSource = () => number;
export type EligibleLoot = { id:string; name:string; image_url:string|null; clearing_slot:ClearingEquipmentSlot; star_rarity:ClearingStarRarity; atk_boost:number|null; def_boost:number|null; health_boost:number|null };

const clearingSlots: readonly ClearingEquipmentSlot[] = ["helmet", "weapon", "armor", "boots", "charm"];

export function isClearingStarRarity(value: unknown): value is ClearingStarRarity {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isClearingSlot(value: unknown): value is ClearingEquipmentSlot {
  return typeof value === "string" && clearingSlots.includes(value as ClearingEquipmentSlot);
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

/** Converts an untrusted driver row into loot data and rejects malformed rows. */
export function normalizeEligibleLoot(row: unknown): EligibleLoot | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const stars = typeof value.star_rarity === "number" ? value.star_rarity : Number(value.star_rarity);
  const atk = optionalNumber(value.atk_boost);
  const def = optionalNumber(value.def_boost);
  const hp = optionalNumber(value.health_boost);
  if (typeof value.id !== "string" || !value.id || typeof value.name !== "string" ||
      (value.image_url !== null && value.image_url !== undefined && typeof value.image_url !== "string") ||
      !isClearingSlot(value.clearing_slot) || !isClearingStarRarity(stars) ||
      atk === undefined || def === undefined || hp === undefined) return null;
  return { id:value.id, name:value.name, image_url:value.image_url ?? null,
    clearing_slot:value.clearing_slot, star_rarity:stars, atk_boost:atk, def_boost:def, health_boost:hp };
}

export function rollClearingRarity(random: RandomSource = Math.random): ClearingStarRarity {
  let roll = random() * 100;
  for (let index = 0; index < CLEARING_LOOT.rarityWeights.length; index++) {
    roll -= CLEARING_LOOT.rarityWeights[index];
    if (roll < 0) return (index + 1) as ClearingStarRarity;
  }
  return 5;
}

export function selectClearingLoot(items: EligibleLoot[], random: RandomSource = Math.random): EligibleLoot | null {
  if (!items.length) return null;
  const selected = rollClearingRarity(random);
  const order = [...Array.from({ length: selected - 1 }, (_, i) => selected - i), ...Array.from({ length: 5 - selected }, (_, i) => selected + i + 1)];
  for (const stars of order) {
    const pool = items.filter(item => Number(item.star_rarity) === stars);
    if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }
  return null;
}

export function serializeGroundDrop(row: any): ClearingGroundDrop {
  if (!isClearingSlot(row.clearing_slot) || !isClearingStarRarity(Number(row.star_rarity))) {
    throw new ClearingDropError("invalid_item", "Clearing item is no longer available");
  }
  return { dropId:row.id, shopItemId:row.shop_item_id, name:row.name, imageUrl:row.image_url ?? null,
    slot:row.clearing_slot, stars:Number(row.star_rarity) as ClearingStarRarity, atkBonus:Number(row.atk_boost ?? 0),
    defBonus:Number(row.def_boost ?? 0), hpBonus:Number(row.health_boost ?? 0), worldX:Number(row.world_x),
    worldY:Number(row.world_y), expiresAt:new Date(row.expires_at).toISOString() };
}

let lastEmptyDiagnostic = 0;
export async function maybeCreateClearingDrop(tx:any, input:{userId:string;sessionId:string;clearingId:string;rewardId:string;worldId:string;worldX:number;worldY:number;now?:Date;random?:RandomSource}) {
  const random=input.random ?? Math.random;
  if (random() >= CLEARING_LOOT.equipmentChance) return null;
  const result=await tx.execute(sql`SELECT id,name,image_url,clearing_slot,star_rarity,atk_boost,def_boost,health_boost FROM shop_items
    WHERE type='clearing' AND clearing_active=true AND clearing_slot IN ('helmet','weapon','armor','boots','charm') AND star_rarity BETWEEN 1 AND 5
      AND world_id IN (${input.worldId}, 'global') AND (location_id IS NULL OR location_id=${input.clearingId})`);
  const normalizedItems: Array<EligibleLoot | null> = result.rows.map(
    (row: unknown): EligibleLoot | null => normalizeEligibleLoot(row),
  );
  const eligibleItems = normalizedItems.filter(
    (item: EligibleLoot | null): item is EligibleLoot => item !== null,
  );
  const item=selectClearingLoot(eligibleItems,random);
  if(!item){if(Date.now()-lastEmptyDiagnostic>60_000){console.warn(`No eligible Clearing equipment configured for ${input.clearingId}`);lastEmptyDiagnostic=Date.now();}return null;}
  const now=input.now ?? new Date();
  const x=Math.max(.2,Math.min(.8,input.worldX+.018)); const y=Math.max(.1,Math.min(.88,input.worldY+.012));
  const inserted=await tx.execute(sql`INSERT INTO clearing_ground_drops(user_id,session_id,clearing_id,shop_item_id,reward_id,world_x,world_y,expires_at)
    VALUES(${input.userId},${input.sessionId},${input.clearingId},${item.id},${input.rewardId},${x},${y},${new Date(now.getTime()+CLEARING_LOOT.expirationMs)})
    ON CONFLICT(reward_id) DO NOTHING RETURNING *`);
  if(!inserted.rows.length)return null;
  return serializeGroundDrop({...inserted.rows[0],...item,shop_item_id:item.id});
}

export async function getActiveClearingDrops(db:any,input:{userId:string;sessionId:string;clearingId:string;now?:Date}) {
  const now=input.now ?? new Date();
  await db.execute(sql`DELETE FROM clearing_ground_drops WHERE expires_at < ${now}`);
  const result=await db.execute(sql`SELECT d.*,s.name,s.image_url,s.clearing_slot,s.star_rarity,s.atk_boost,s.def_boost,s.health_boost FROM clearing_ground_drops d
    JOIN shop_items s ON s.id=d.shop_item_id WHERE d.user_id=${input.userId} AND d.session_id=${input.sessionId}
    AND d.clearing_id=${input.clearingId} AND d.collected_at IS NULL AND d.expires_at>${now}`);
  return result.rows.map(serializeGroundDrop);
}

export class ClearingDropError extends Error { constructor(public code:"not_found"|"wrong_session"|"expired"|"distance"|"invalid_item",message:string){super(message);} }

export async function collectClearingDrop(db:any,input:{userId:string;sessionId:string;clearingId:string;dropId:string;playerX:number;playerY:number;worldPixels:{width:number;height:number};now?:Date}) {
  return db.transaction(async(tx:any)=>{
    const found=await tx.execute(sql`SELECT d.*,s.type,s.clearing_slot,s.star_rarity,s.name,s.image_url,s.atk_boost,s.def_boost,s.health_boost FROM clearing_ground_drops d LEFT JOIN shop_items s ON s.id=d.shop_item_id WHERE d.id=${input.dropId} FOR UPDATE`);
    const row=found.rows[0] as any;if(!row||row.user_id!==input.userId)throw new ClearingDropError("not_found","Clearing Ground Drop was not found");
    if(row.session_id!==input.sessionId||row.clearing_id!==input.clearingId)throw new ClearingDropError("wrong_session","Clearing Ground Drop belongs to another session");
    if(row.collected_at)return {alreadyCollected:true,item:serializeGroundDrop(row)};
    if(new Date(row.expires_at)<= (input.now??new Date()))throw new ClearingDropError("expired","Clearing Ground Drop expired");
    if(row.type!=="clearing"||!["helmet","weapon","armor","boots","charm"].includes(row.clearing_slot)||Number(row.star_rarity)<1||Number(row.star_rarity)>5)throw new ClearingDropError("invalid_item","Clearing item is no longer available");
    const distance=Math.hypot((input.playerX-Number(row.world_x))*input.worldPixels.width,(input.playerY-Number(row.world_y))*input.worldPixels.height);
    if(distance>CLEARING_LOOT.pickupRadiusPixels)throw new ClearingDropError("distance","Move closer to collect this Clearing Ground Drop");
    await tx.execute(sql`INSERT INTO user_inventory(user_id,shop_item_id,quantity) VALUES(${input.userId},${row.shop_item_id},1)`);
    await tx.execute(sql`UPDATE clearing_ground_drops SET collected_at=${input.now??new Date()} WHERE id=${input.dropId} AND collected_at IS NULL`);
    return {alreadyCollected:false,item:serializeGroundDrop(row)};
  });
}
