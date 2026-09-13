import { sql } from "drizzle-orm";
import type { ClearingRewardChest, ClearingRewardBundle } from "@shared/clearingEquipment";
import { buildClearingLoot, type ClearingLootItem, type RandomSource } from "./clearingLoot";

export const CLEARING_CHEST_REWARDS = { expirationMs: 30_000, maxItems: 5 } as const;

const normalizeRewards = (raw: any): ClearingRewardBundle => {
  const equipment = Array.isArray(raw?.equipment) ? raw.equipment : [];
  const consumables = Array.isArray(raw?.consumables) ? raw.consumables : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : [
        ...equipment.map((item: any) => ({
          ...item,
          type: "clearing",
          starRarity: item.stars,
          rarity: item.stars >= 3 ? "rare" : item.stars === 2 ? "uncommon" : "common",
        })),
        ...consumables.map((item: any) => ({
          ...item,
          type: "consumable",
          starRarity: 0,
          rarity: "common",
        })),
      ];

  return {
    exp: 0,
    coins: Number(raw?.coins || 0),
    essence: Number(raw?.essence || 0),
    sourceWorldId: typeof raw?.sourceWorldId === "string" ? raw.sourceWorldId : undefined,
    items,
    equipment,
    consumables,
  };
};

const serialize = (row: any): ClearingRewardChest => ({
  chestId: row.id,
  sessionId: row.session_id,
  defeatedEnemyId: row.defeated_enemy_id,
  worldX: Number(row.world_x),
  worldY: Number(row.world_y),
  createdAt: new Date(row.created_at).toISOString(),
  expiresAt: new Date(row.expires_at).toISOString(),
  claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
  status: row.claimed_at ? "claimed" : "unclaimed",
  highestEquipmentRarity: Number(row.highest_equipment_rarity) as any,
  rewards: normalizeRewards(row.rewards),
});

export function isConfiguredClearingChestItem(item: ClearingLootItem) {
  return item.type !== "clearing"
    || (item.clearing_active !== false && ["helmet", "weapon", "armor", "boots", "charm"].includes(item.clearing_slot ?? ""));
}

export async function createClearingRewardChest(
  tx: any,
  input: {
    userId: string;
    sessionId: string;
    clearingId: string;
    worldId: string;
    enemyId: string;
    petInventoryId: string;
    worldX: number;
    worldY: number;
    boss: boolean;
    now?: Date;
    random?: RandomSource;
  },
) {
  const query = await tx.execute(sql`SELECT s.id,s.name,s.image_url,s.type,COALESCE(s.star_rarity,0) star_rarity,d.rarity,s.clearing_slot,s.clearing_active,s.atk_boost,s.def_boost,s.health_boost FROM clearing_world_drops d JOIN shop_items s ON s.id=d.shop_item_id WHERE d.world_id=${input.worldId}`);
  const configured = (query.rows as ClearingLootItem[]).filter(isConfiguredClearingChestItem);
  const loot = buildClearingLoot(configured, input.boss, input.random);
  if (loot.warning) {
    console.warn("Clearing loot configuration warning", { worldId: input.worldId, warning: loot.warning });
  }

  const items = loot.items.map((item) => ({
    shopItemId: item.id,
    name: item.name,
    imageUrl: item.image_url,
    type: item.type,
    quantity: 1,
    starRarity: Number(item.star_rarity || 0),
    rarity: item.rarity,
    slot: item.clearing_slot,
    atkBonus: Number(item.atk_boost || 0),
    defBonus: Number(item.def_boost || 0),
    hpBonus: Number(item.health_boost || 0),
  }));
  const rewards: ClearingRewardBundle = {
    exp: 0,
    coins: loot.coins,
    essence: loot.essence,
    sourceWorldId: input.worldId,
    items,
    equipment: [],
    consumables: [],
  };
  const now = input.now ?? new Date();
  const highest = Math.max(0, ...items.filter((item) => item.type === "clearing").map((item) => item.starRarity));
  const inserted = await tx.execute(sql`INSERT INTO clearing_reward_chests(user_id,session_id,clearing_id,defeated_enemy_id,pet_inventory_id,world_x,world_y,rewards,highest_equipment_rarity,expires_at) VALUES(${input.userId},${input.sessionId},${input.clearingId},${input.enemyId},${input.petInventoryId},${input.worldX},${input.worldY},${JSON.stringify(rewards)}::jsonb,${highest},${new Date(now.getTime() + CLEARING_CHEST_REWARDS.expirationMs)}) ON CONFLICT(user_id,defeated_enemy_id) DO UPDATE SET session_id=excluded.session_id RETURNING *`);
  return serialize(inserted.rows[0]);
}

export async function getClearingRewardChests(
  db: any,
  input: { userId: string; sessionId: string; clearingId: string },
) {
  await db.execute(sql`UPDATE clearing_reward_chests SET session_id=${input.sessionId} WHERE user_id=${input.userId} AND clearing_id=${input.clearingId} AND claimed_at IS NULL AND expires_at>now()`);
  return (
    await db.execute(sql`SELECT * FROM clearing_reward_chests WHERE user_id=${input.userId} AND session_id=${input.sessionId} AND clearing_id=${input.clearingId} AND claimed_at IS NULL AND expires_at>now() ORDER BY created_at`)
  ).rows.map(serialize);
}

export class ClearingChestError extends Error {
  constructor(public code: "not_found" | "expired" | "invalid_reward", message: string) {
    super(message);
  }
}

export async function claimClearingRewardChest(
  db: any,
  input: { userId: string; chestId: string; now?: Date },
) {
  return db.transaction(async (tx: any) => {
    const found = await tx.execute(sql`SELECT * FROM clearing_reward_chests WHERE id=${input.chestId} FOR UPDATE`);
    const row = found.rows[0] as any;
    if (!row || row.user_id !== input.userId) {
      throw new ClearingChestError("not_found", "Treasure chest was not found");
    }
    if (row.claimed_at) {
      console.info("Clearing duplicate chest claim blocked", {
        userId: input.userId,
        chestId: input.chestId,
        defeatedEnemyId: row.defeated_enemy_id,
      });
      return { alreadyClaimed: true, chest: serialize(row) };
    }
    if (new Date(row.expires_at) <= (input.now ?? new Date())) {
      throw new ClearingChestError("expired", "Treasure chest expired");
    }

    const rewards = normalizeRewards(row.rewards);
    if (
      rewards.items.length > CLEARING_CHEST_REWARDS.maxItems
      || new Set(rewards.items.map((item) => item.shopItemId)).size !== rewards.items.length
    ) {
      throw new ClearingChestError("invalid_reward", "Treasure rewards are invalid");
    }

    // Reward snapshots are only valid while every item remains in the current
    // admin-configured pool. FOR SHARE serializes this check against removal.
    if (rewards.sourceWorldId) {
      for (const item of rewards.items) {
        const configured = await tx.execute(sql`SELECT 1 FROM clearing_world_drops WHERE world_id=${rewards.sourceWorldId} AND shop_item_id=${item.shopItemId} FOR SHARE`);
        if (!configured.rows.length) {
          throw new ClearingChestError("invalid_reward", "A reward was removed from this Clearing");
        }
      }
    }

    const balances = await tx.execute(sql`UPDATE users SET coins=coins+${rewards.coins},essence=essence+${rewards.essence},total_coins_earned=total_coins_earned+${rewards.coins} WHERE id=${input.userId} RETURNING coins,essence`);
    for (const item of rewards.items) {
      const granted = await tx.execute(sql`INSERT INTO user_inventory(user_id,shop_item_id,quantity) SELECT ${input.userId},id,${Math.max(1, Number(item.quantity || 1))} FROM shop_items WHERE id=${item.shopItemId} RETURNING id`);
      if (!granted.rows.length) {
        throw new ClearingChestError("invalid_reward", "Reward item is no longer available");
      }
    }

    const claimed = await tx.execute(sql`UPDATE clearing_reward_chests SET claimed_at=${input.now ?? new Date()} WHERE id=${input.chestId} AND claimed_at IS NULL RETURNING *`);
    console.info("Clearing chest claimed", {
      userId: input.userId,
      chestId: input.chestId,
      defeatedEnemyId: row.defeated_enemy_id,
      sourceWorldId: rewards.sourceWorldId ?? null,
      shopItemIds: rewards.items.map((item) => item.shopItemId),
    });
    return {
      alreadyClaimed: false,
      chest: serialize(claimed.rows[0]),
      balances: {
        coins: Number((balances.rows[0] as any).coins),
        essence: Number((balances.rows[0] as any).essence),
      },
    };
  });
}
