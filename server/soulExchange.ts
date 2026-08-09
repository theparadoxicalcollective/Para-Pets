import { sql } from "drizzle-orm";
import { db } from "./db";

export const SOUL_EXCHANGE_ESSENCE_BY_RARITY = Object.freeze({ 1: 50, 2: 125, 3: 300, 4: 750, 5: 1750 } as const);
export type SoulExchangeBlock = "egg" | "active" | "accessories" | "market" | "pvp" | "house" | "clearing" | "cave";

const message: Record<SoulExchangeBlock, string> = {
  egg: "Only hatched pets can enter the Soul Exchange.", active: "Choose a different active pet first.",
  accessories: "Remove accessories before exchanging.", market: "Remove this pet from the marketplace first.",
  pvp: "Remove this pet from your PvP battle group first.", house: "Remove this pet from your house first.",
  clearing: "Claim this pet's Clearing rewards first.", cave: "This pet has persistent cave progression and cannot be exchanged.",
};

export class SoulExchangeError extends Error { constructor(public code: string, text: string, public status = 409) { super(text); } }

export async function getSoulExchangePets(userId: string) {
  const result = await db.execute(sql`SELECT ui.id "inventoryId", ui.is_hatched "isHatched", ui.pet_nickname "nickname",
    si.id "shopItemId", si.name, si.type, COALESCE(si.star_rarity,si.rarity,1) rarity,
    COALESCE(si.hatched_image_url,si.image_url) "imageUrl",
    (u.active_pet_id=ui.id) active,
    EXISTS(SELECT 1 FROM pet_equipped_accessories x WHERE x.pet_inventory_id=ui.id) accessories,
    (ui.is_listed OR EXISTS(SELECT 1 FROM player_market_listings m WHERE m.inventory_id=ui.id AND m.status='active')) market,
    EXISTS(SELECT 1 FROM pvp_battle_groups g WHERE g.user_id=ui.user_id AND ui.id=ANY(g.pet_inventory_ids)) pvp,
    EXISTS(SELECT 1 FROM pet_house_positions h WHERE h.user_id=ui.user_id AND h.inventory_id=ui.id) house,
    EXISTS(SELECT 1 FROM clearing_reward_chests c WHERE c.pet_inventory_id=ui.id) clearing,
    EXISTS(SELECT 1 FROM pet_cave_progress p WHERE p.pet_inventory_id=ui.id) cave
    FROM user_inventory ui JOIN shop_items si ON si.id=ui.shop_item_id JOIN users u ON u.id=ui.user_id
    WHERE ui.user_id=${userId} AND si.type='pet' ORDER BY ui.acquired_at`);
  return (result.rows as any[]).map(row => {
    const reason = (!row.isHatched ? "egg" : row.active ? "active" : row.accessories ? "accessories" : row.market ? "market" : row.pvp ? "pvp" : row.house ? "house" : row.clearing ? "clearing" : row.cave ? "cave" : null) as SoulExchangeBlock | null;
    const rarity = Math.max(1, Math.min(5, Number(row.rarity) || 1)) as keyof typeof SOUL_EXCHANGE_ESSENCE_BY_RARITY;
    return { ...row, rarity, essenceValue: SOUL_EXCHANGE_ESSENCE_BY_RARITY[rarity], eligible: !reason, unavailableReason: reason ? message[reason] : null };
  });
}

export async function getSoulExchangeState(userId: string) {
  const [pets, balance] = await Promise.all([getSoulExchangePets(userId), db.execute(sql`SELECT essence FROM users WHERE id=${userId}`)]);
  return { pets, essence: Number((balance.rows[0] as any)?.essence ?? 0) };
}

export async function exchangePet(userId: string, petInventoryId: string, exchangeActionId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(exchangeActionId)) throw new SoulExchangeError("invalid_action_id", "A valid exchangeActionId is required.", 400);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${exchangeActionId}))`);
    const previous = await tx.execute(sql`SELECT * FROM soul_exchange_transactions WHERE exchange_action_id=${exchangeActionId} AND user_id=${userId}`);
    if (previous.rows[0]) { const p:any=previous.rows[0]; return { success:true, alreadyCompleted:true, pet:{ inventoryId:p.pet_inventory_id, shopItemId:p.shop_item_id, name:p.pet_name, rarity:p.rarity }, essenceAwarded:p.essence_awarded, newEssenceBalance:p.resulting_essence }; }
    const found = await tx.execute(sql`SELECT ui.*,si.name,si.type,COALESCE(si.star_rarity,si.rarity,1) rarity,si.id shop_item_identity,u.active_pet_id
      FROM user_inventory ui JOIN shop_items si ON si.id=ui.shop_item_id JOIN users u ON u.id=ui.user_id WHERE ui.id=${petInventoryId} FOR UPDATE OF ui,u`);
    const pet:any=found.rows[0];
    if (!pet || pet.user_id !== userId) throw new SoulExchangeError("pet_not_found", "Pet not found.", 404);
    if (pet.type !== "pet") throw new SoulExchangeError("not_pet", "Only pets can be exchanged.", 400);
    const checks:Array<[SoulExchangeBlock, any]> = [
      ["egg", !pet.is_hatched], ["active", pet.active_pet_id===pet.id],
      ["accessories", sql`SELECT 1 FROM pet_equipped_accessories WHERE pet_inventory_id=${pet.id} LIMIT 1`],
      ["market", pet.is_listed ? true : sql`SELECT 1 FROM player_market_listings WHERE inventory_id=${pet.id} AND status='active' LIMIT 1`],
      ["pvp", sql`SELECT 1 FROM pvp_battle_groups WHERE user_id=${userId} AND ${pet.id}=ANY(pet_inventory_ids) LIMIT 1`],
      ["house", sql`SELECT 1 FROM pet_house_positions WHERE user_id=${userId} AND inventory_id=${pet.id} LIMIT 1`],
      ["clearing", sql`SELECT 1 FROM clearing_reward_chests WHERE pet_inventory_id=${pet.id} LIMIT 1`],
      ["cave", sql`SELECT 1 FROM pet_cave_progress WHERE pet_inventory_id=${pet.id} LIMIT 1`],
    ];
    for (const [code, check] of checks) { const blocked = check === true || (check !== false && (await tx.execute(check)).rows.length>0); if (blocked) throw new SoulExchangeError(code,message[code]); }
    const rarity=Math.max(1,Math.min(5,Number(pet.rarity)||1)) as keyof typeof SOUL_EXCHANGE_ESSENCE_BY_RARITY, reward=SOUL_EXCHANGE_ESSENCE_BY_RARITY[rarity];
    const balance=await tx.execute(sql`UPDATE users SET essence=essence+${reward} WHERE id=${userId} RETURNING essence`);
    const deleted=await tx.execute(sql`DELETE FROM user_inventory WHERE id=${pet.id} AND user_id=${userId} RETURNING id`);
    if (deleted.rows.length!==1) throw new SoulExchangeError("exchange_conflict","The pet changed before the ritual completed.");
    const displayName=pet.pet_nickname||pet.name;
    await tx.execute(sql`INSERT INTO soul_exchange_transactions(exchange_action_id,user_id,pet_inventory_id,shop_item_id,pet_name,rarity,essence_awarded,resulting_essence) VALUES(${exchangeActionId},${userId},${pet.id},${pet.shop_item_identity},${displayName},${rarity},${reward},${Number((balance.rows[0] as any).essence)})`);
    return { success:true, alreadyCompleted:false, pet:{inventoryId:pet.id,shopItemId:pet.shop_item_identity,name:displayName,rarity}, essenceAwarded:reward,newEssenceBalance:Number((balance.rows[0] as any).essence) };
  });
}
