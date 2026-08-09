import { sql } from "drizzle-orm";
import { db } from "./db";

export const SOUL_EXCHANGE_ESSENCE_BY_RARITY = Object.freeze({ 1: 50, 2: 125, 3: 300, 4: 750, 5: 1750 } as const);
export const SOUL_EXCHANGE_MAX_BATCH_SIZE = 50;

export type SoulExchangeBlock = "egg" | "active" | "accessories" | "market" | "pvp" | "house" | "clearing" | "cave";

const blockMessage: Record<SoulExchangeBlock, string> = {
  egg: "Eggs cannot be exchanged. Only hatched pets may enter the Soul Exchange.",
  active: "Active pets cannot be exchanged. Choose a different active pet first.",
  accessories: "Remove accessories before exchanging.",
  market: "Listed pets cannot be exchanged. Remove this pet from the marketplace first.",
  pvp: "Pets in PvP teams cannot be exchanged. Remove this pet from your battle group first.",
  house: "Remove this pet from your house first.",
  clearing: "Claim this pet's Clearing rewards first.",
  cave: "This pet has persistent cave progression and cannot be exchanged.",
};

export class SoulExchangeError extends Error {
  constructor(public code: string, text: string, public status = 409) { super(text); }
}

function rarityAndValue(value: unknown) {
  const rarity = Math.max(1, Math.min(5, Number(value) || 1)) as keyof typeof SOUL_EXCHANGE_ESSENCE_BY_RARITY;
  return { rarity, essenceValue: SOUL_EXCHANGE_ESSENCE_BY_RARITY[rarity] };
}

function blockedReason(row: any): SoulExchangeBlock | null {
  return !row.isHatched ? "egg" : row.active ? "active" : row.accessories ? "accessories" :
    row.market ? "market" : row.pvp ? "pvp" : row.house ? "house" :
      row.clearing ? "clearing" : row.cave ? "cave" : null;
}

const petStateSelect = sql`SELECT ui.id "inventoryId", ui.user_id "userId", ui.is_hatched "isHatched",
  ui.pet_nickname nickname, si.id "shopItemId", si.name, si.type,
  COALESCE(si.star_rarity,si.rarity,1) rarity, COALESCE(si.hatched_image_url,si.image_url) "imageUrl",
  (u.active_pet_id=ui.id) active,
  EXISTS(SELECT 1 FROM pet_equipped_accessories x WHERE x.pet_inventory_id=ui.id) accessories,
  (ui.is_listed OR EXISTS(SELECT 1 FROM player_market_listings m WHERE m.inventory_id=ui.id AND m.status='active')) market,
  EXISTS(SELECT 1 FROM pvp_battle_groups g WHERE g.user_id=ui.user_id AND ui.id=ANY(g.pet_inventory_ids)) pvp,
  EXISTS(SELECT 1 FROM pet_house_positions h WHERE h.user_id=ui.user_id AND h.inventory_id=ui.id) house,
  EXISTS(SELECT 1 FROM clearing_reward_chests c WHERE c.pet_inventory_id=ui.id) clearing,
  EXISTS(SELECT 1 FROM pet_cave_progress p WHERE p.pet_inventory_id=ui.id) cave
  FROM user_inventory ui JOIN shop_items si ON si.id=ui.shop_item_id JOIN users u ON u.id=ui.user_id`;

function serializePet(row: any) {
  const reason = blockedReason(row);
  const reward = rarityAndValue(row.rarity);
  return { ...row, ...reward, eligible: !reason, unavailableReason: reason ? blockMessage[reason] : null };
}

export async function getSoulExchangePets(userId: string) {
  const result = await db.execute(sql`${petStateSelect} WHERE ui.user_id=${userId} AND si.type='pet' ORDER BY ui.acquired_at`);
  return (result.rows as any[]).map(serializePet);
}

export async function getSoulExchangeState(userId: string) {
  const [pets, balance] = await Promise.all([getSoulExchangePets(userId), db.execute(sql`SELECT essence FROM users WHERE id=${userId}`)]);
  return { pets, essence: Number((balance.rows[0] as any)?.essence ?? 0) };
}

function validateRequest(petInventoryIds: unknown, exchangeActionId: unknown): string[] {
  if (typeof exchangeActionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(exchangeActionId))
    throw new SoulExchangeError("invalid_action_id", "A valid exchangeActionId is required.", 400);
  if (!Array.isArray(petInventoryIds) || petInventoryIds.length === 0 || petInventoryIds.length > SOUL_EXCHANGE_MAX_BATCH_SIZE || petInventoryIds.some(id => typeof id !== "string" || !id))
    throw new SoulExchangeError("invalid_batch", `Choose between 1 and ${SOUL_EXCHANGE_MAX_BATCH_SIZE} pets.`, 400);
  const ids = [...new Set(petInventoryIds as string[])];
  if (ids.length !== petInventoryIds.length) throw new SoulExchangeError("duplicate_pet", "Each selected pet may only appear once.", 400);
  return ids;
}

export async function exchangePets(userId: string, petInventoryIds: unknown, exchangeActionId: unknown) {
  const ids = validateRequest(petInventoryIds, exchangeActionId);
  const actionId = exchangeActionId as string;
  const idList = sql.join(ids.map(id => sql`${id}`), sql`, `);

  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actionId}))`);
    const previous = await tx.execute(sql`SELECT * FROM soul_exchange_transactions WHERE exchange_action_id=${actionId}`);
    if (previous.rows[0]) {
      const p: any = previous.rows[0];
      if (p.user_id !== userId) throw new SoulExchangeError("action_id_conflict", "That exchange action ID is already in use.", 409);
      return { success: true, alreadyCompleted: true, exchangedPets: p.exchanged_pets, essenceAwarded: p.essence_awarded, newEssenceBalance: p.resulting_essence };
    }

    const user = await tx.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
    if (!user.rows.length) throw new SoulExchangeError("user_not_found", "Player not found.", 404);
    // These tables can create protected references without updating the pet
    // row. Lock their writes until validation and deletion complete, closing
    // the check-then-insert race without changing any other feature's schema.
    await tx.execute(sql`LOCK TABLE pet_equipped_accessories, player_market_listings, pvp_battle_groups,
      pet_house_positions, clearing_reward_chests, pet_cave_progress IN SHARE ROW EXCLUSIVE MODE`);
    const found = await tx.execute(sql`${petStateSelect} WHERE ui.id IN (${idList}) AND si.type='pet' FOR UPDATE OF ui`);
    const rows = found.rows as any[];
    // Do not reveal whether a missing ID belongs to another player.
    if (rows.length !== ids.length || rows.some(row => row.userId !== userId))
      throw new SoulExchangeError("pet_not_found", "One or more selected pets could not be found.", 404);

    const pets = ids.map(id => rows.find(row => row.inventoryId === id)!);
    for (const pet of pets) {
      const reason = blockedReason(pet);
      if (reason) throw new SoulExchangeError(reason, `${pet.nickname || pet.name}: ${blockMessage[reason]}`);
    }

    const exchangedPets = pets.map(pet => {
      const reward = rarityAndValue(pet.rarity);
      return { inventoryId: pet.inventoryId, shopItemId: pet.shopItemId, name: pet.nickname || pet.name, ...reward };
    });
    const total = exchangedPets.reduce((sum, pet) => sum + pet.essenceValue, 0);
    const deleted = await tx.execute(sql`DELETE FROM user_inventory WHERE user_id=${userId} AND id IN (${idList}) RETURNING id`);
    if (deleted.rows.length !== ids.length) throw new SoulExchangeError("exchange_conflict", "A selected pet changed before the ritual completed.");
    const balance = await tx.execute(sql`UPDATE users SET essence=essence+${total} WHERE id=${userId} RETURNING essence`);
    const newEssenceBalance = Number((balance.rows[0] as any).essence);
    const first = exchangedPets[0];
    await tx.execute(sql`INSERT INTO soul_exchange_transactions(
      exchange_action_id,user_id,pet_inventory_id,shop_item_id,pet_name,rarity,essence_awarded,resulting_essence,exchanged_pets
    ) VALUES(${actionId},${userId},${first.inventoryId},${first.shopItemId},${first.name},${first.rarity},${total},${newEssenceBalance},${JSON.stringify(exchangedPets)}::jsonb)`);
    return { success: true, alreadyCompleted: false, exchangedPets, essenceAwarded: total, newEssenceBalance };
  });
}
