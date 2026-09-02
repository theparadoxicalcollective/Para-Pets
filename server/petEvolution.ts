import { petHatchedImageSql } from "./petStillImage";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  EVOLUTION_NODE_COIN_REWARD,
  EVOLUTION_REWARD_SLOT_COUNT,
  EVOLUTION_SLOT_COUNT,
  applyEvolutionPoints,
  evolutionFeedPointsForRarity,
  evolutionStatRewardForRarity,
  evolutionTargetForRarity,
  normalizePetRarity,
} from "@shared/evolution";

export class PetEvolutionError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

let evolutionStorageReady: Promise<void> | null = null;

/**
 * Evolution persistence is deliberately isolated from user_inventory so the
 * feature can be introduced without widening every inventory query in the
 * game. ON DELETE CASCADE cleans progress if the target pet later leaves the
 * player's inventory through another supported feature.
 */
export function ensureEvolutionStorage(): Promise<void> {
  if (!evolutionStorageReady) {
    evolutionStorageReady = (async () => {
      // Keep the six-slot check literal in DDL. PostgreSQL utility statements
      // cannot reliably use bind parameters inside CREATE TABLE constraints.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pet_evolution_progress (
          pet_inventory_id VARCHAR PRIMARY KEY REFERENCES user_inventory(id) ON DELETE CASCADE,
          completed_slots INTEGER NOT NULL DEFAULT 0 CHECK (completed_slots BETWEEN 0 AND 6),
          current_points INTEGER NOT NULL DEFAULT 0 CHECK (current_points >= 0),
          claimed_slots_mask INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        ALTER TABLE pet_evolution_progress
        ADD COLUMN IF NOT EXISTS claimed_slots_mask INTEGER NOT NULL DEFAULT 0
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pet_evolution_feed_actions (
          action_id UUID PRIMARY KEY,
          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_pet_id VARCHAR NOT NULL,
          feeder_pet_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
          resulting_completed_slots INTEGER NOT NULL,
          resulting_current_points INTEGER NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pet_evolution_feed_actions_user_created_idx
        ON pet_evolution_feed_actions(user_id, created_at DESC)
      `);
    })().catch((error) => {
      evolutionStorageReady = null;
      throw error;
    });
  }
  return evolutionStorageReady;
}

const petStateSelect = sql`SELECT
  ui.id "inventoryId",
  ui.user_id "userId",
  ui.is_hatched "isHatched",
  ui.is_listed "isListed",
  ui.pet_nickname nickname,
  ui.acquired_at "acquiredAt",
  si.id "shopItemId",
  si.name,
  si.type,
  si.pet_template_id "petTemplateId",
  COALESCE(si.star_rarity, si.rarity, 1) rarity,
  COALESCE(${petHatchedImageSql(sql`ui.is_hatched`, sql`ui.is_evolved`, sql`si.evolution_image_url`, sql`si.hatched_image_url`)}, si.image_url) "imageUrl",
  (u.active_pet_id = ui.id) active,
  EXISTS(SELECT 1 FROM pet_equipped_accessories x WHERE x.pet_inventory_id = ui.id) accessories,
  (ui.is_listed OR EXISTS(SELECT 1 FROM player_market_listings m WHERE m.inventory_id = ui.id AND m.status = 'active')) market,
  EXISTS(SELECT 1 FROM pvp_battle_groups g WHERE g.user_id = ui.user_id AND ui.id = ANY(g.pet_inventory_ids)) pvp,
  EXISTS(SELECT 1 FROM pet_house_positions h WHERE h.user_id = ui.user_id AND h.inventory_id = ui.id) house,
  EXISTS(SELECT 1 FROM pet_cave_progress p WHERE p.pet_inventory_id = ui.id) cave
FROM user_inventory ui
JOIN shop_items si ON si.id = ui.shop_item_id
JOIN users u ON u.id = ui.user_id`;

type PetBlock = "egg" | "active" | "accessories" | "market" | "pvp" | "house" | "cave";

const blockMessage: Record<PetBlock, string> = {
  egg: "Only hatched pets can be used for evolution.",
  active: "The active pet cannot be used as a feeder.",
  accessories: "Remove this pet's accessories first.",
  market: "Remove this pet from the marketplace first.",
  pvp: "Remove this pet from its PvP team first.",
  house: "Remove this pet from its house first.",
  cave: "This pet has cave progress and cannot be consumed.",
};

function blockedReason(row: any): PetBlock | null {
  if (!row.isHatched) return "egg";
  if (row.active) return "active";
  if (row.accessories) return "accessories";
  if (row.market) return "market";
  if (row.pvp) return "pvp";
  if (row.house) return "house";
  if (row.cave) return "cave";
  return null;
}

function serializeFeeder(row: any) {
  const rarity = normalizePetRarity(row.rarity);
  const reason = blockedReason(row);
  return {
    inventoryId: row.inventoryId,
    name: row.nickname || row.name,
    rarity,
    imageUrl: row.imageUrl ?? null,
    petTemplateId: row.petTemplateId ?? null,
    evolutionPoints: evolutionFeedPointsForRarity(rarity),
    eligible: !reason,
    unavailableReason: reason ? blockMessage[reason] : null,
  };
}

async function getActiveTarget(userId: string) {
  const target = await db.execute(sql`${petStateSelect}
    WHERE ui.user_id = ${userId}
      AND u.active_pet_id = ui.id
      AND si.type = 'pet'
    LIMIT 1`);
  const row = target.rows[0] as any;
  if (!row) throw new PetEvolutionError("active_pet_not_found", "Choose an active pet before evolving.", 404);
  if (!row.isHatched) throw new PetEvolutionError("active_pet_not_hatched", "Hatch this pet before evolving it.", 409);
  return row;
}

export async function getActiveEvolutionState(userId: string) {
  await ensureEvolutionStorage();
  const target = await getActiveTarget(userId);
  const progress = await db.execute(sql`
    SELECT completed_slots, current_points, claimed_slots_mask
    FROM pet_evolution_progress
    WHERE pet_inventory_id = ${target.inventoryId}
  `);
  const completedSlots = Number((progress.rows[0] as any)?.completed_slots ?? 0);
  const currentPoints = Number((progress.rows[0] as any)?.current_points ?? 0);
  const claimedSlotsMask = Number((progress.rows[0] as any)?.claimed_slots_mask ?? 0);
  const claimedSlots = Array.from({ length: EVOLUTION_REWARD_SLOT_COUNT }, (_, index) => index + 1)
    .filter((slot) => (claimedSlotsMask & (1 << (slot - 1))) !== 0);
  const rarity = normalizePetRarity(target.rarity);
  const pointsRequired = evolutionTargetForRarity(rarity);

  const feedersResult = await db.execute(sql`${petStateSelect}
    WHERE ui.user_id = ${userId}
      AND si.type = 'pet'
      AND ui.id <> ${target.inventoryId}
    ORDER BY ui.acquired_at ASC`);
  const allFeeders = (feedersResult.rows as any[]).map(serializeFeeder);
  const feeders = allFeeders.filter((pet) => pet.eligible);

  return {
    target: {
      inventoryId: target.inventoryId,
      name: target.nickname || target.name,
      rarity,
      imageUrl: target.imageUrl ?? null,
      petTemplateId: target.petTemplateId ?? null,
    },
    slotCount: EVOLUTION_SLOT_COUNT,
    completedSlots,
    currentPoints,
    claimedSlots,
    nodeCoinReward: EVOLUTION_NODE_COIN_REWARD,
    nodeStatReward: evolutionStatRewardForRarity(rarity),
    pointsRequired,
    percent: completedSlots >= EVOLUTION_SLOT_COUNT ? 100 : Math.max(0, Math.min(100, (currentPoints / pointsRequired) * 100)),
    isComplete: completedSlots >= EVOLUTION_SLOT_COUNT,
    feeders,
    blockedPetCount: allFeeders.length - feeders.length,
  };
}


function validateRewardSlot(slotInput: unknown): number {
  const slot = Number(slotInput);
  if (!Number.isInteger(slot) || slot < 1 || slot > EVOLUTION_SLOT_COUNT) {
    throw new PetEvolutionError("invalid_reward_slot", "Choose a valid completed evolution node.", 400);
  }
  if (slot === EVOLUTION_SLOT_COUNT) {
    throw new PetEvolutionError("evolution_coming_soon", "Evolution Coming Soon", 409);
  }
  return slot;
}

export async function claimActiveEvolutionReward(userId: string, slotInput: unknown) {
  await ensureEvolutionStorage();
  const slot = validateRewardSlot(slotInput);

  return db.transaction(async (tx) => {
    const userResult = await tx.execute(sql`
      SELECT id, active_pet_id
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `);
    const user = userResult.rows[0] as any;
    if (!user) throw new PetEvolutionError("user_not_found", "Player not found.", 404);
    if (!user.active_pet_id) throw new PetEvolutionError("active_pet_not_found", "Choose an active pet before claiming an evolution reward.", 404);

    const targetResult = await tx.execute(sql`
      SELECT ui.id, COALESCE(si.star_rarity, si.rarity, 1) rarity
      FROM user_inventory ui
      JOIN shop_items si ON si.id = ui.shop_item_id
      WHERE ui.id = ${user.active_pet_id}
        AND ui.user_id = ${userId}
        AND ui.is_hatched = true
        AND si.type = 'pet'
      FOR UPDATE OF ui
    `);
    const target = targetResult.rows[0] as any;
    if (!target) throw new PetEvolutionError("active_pet_not_found", "The active pet could not be found.", 404);

    const progressResult = await tx.execute(sql`
      SELECT completed_slots, claimed_slots_mask
      FROM pet_evolution_progress
      WHERE pet_inventory_id = ${target.id}
      FOR UPDATE
    `);
    const progress = progressResult.rows[0] as any;
    const completedSlots = Number(progress?.completed_slots ?? 0);
    const claimedSlotsMask = Number(progress?.claimed_slots_mask ?? 0);
    if (!progress || completedSlots < slot) {
      throw new PetEvolutionError("reward_not_ready", "Complete this evolution node before claiming its reward.", 409);
    }

    const claimBit = 1 << (slot - 1);
    if ((claimedSlotsMask & claimBit) !== 0) {
      throw new PetEvolutionError("reward_already_claimed", "This evolution reward has already been collected.", 409);
    }

    const rarity = normalizePetRarity(target.rarity);
    const statBoost = evolutionStatRewardForRarity(rarity);
    const nextClaimedMask = claimedSlotsMask | claimBit;

    await tx.execute(sql`
      UPDATE pet_evolution_progress
      SET claimed_slots_mask = ${nextClaimedMask}, updated_at = now()
      WHERE pet_inventory_id = ${target.id}
    `);
    const playerUpdate = await tx.execute(sql`
      UPDATE users
      SET coins = coins + ${EVOLUTION_NODE_COIN_REWARD},
          total_coins_earned = total_coins_earned + ${EVOLUTION_NODE_COIN_REWARD}
      WHERE id = ${userId}
      RETURNING coins
    `);
    const petUpdate = await tx.execute(sql`
      UPDATE user_inventory
      SET pet_atk = pet_atk + ${statBoost},
          pet_def = pet_def + ${statBoost},
          pet_health = pet_health + ${statBoost}
      WHERE id = ${target.id} AND user_id = ${userId}
      RETURNING pet_atk "petAtk", pet_def "petDef", pet_health "petHealth"
    `);
    if (!playerUpdate.rows[0] || !petUpdate.rows[0]) {
      throw new Error("Evolution reward update failed");
    }

    const stats = petUpdate.rows[0] as any;
    return {
      success: true,
      slot,
      coinReward: EVOLUTION_NODE_COIN_REWARD,
      statBoost,
      newCoinBalance: Number((playerUpdate.rows[0] as any).coins),
      petStats: {
        atk: Number(stats.petAtk),
        def: Number(stats.petDef),
        health: Number(stats.petHealth),
      },
    };
  });
}

function validateFeedRequest(feederPetIds: unknown, actionId: unknown): { ids: string[]; actionId: string } {
  if (typeof actionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId)) {
    throw new PetEvolutionError("invalid_action_id", "A valid evolution action ID is required.", 400);
  }
  if (!Array.isArray(feederPetIds) || feederPetIds.length < 1 || feederPetIds.length > 50 || feederPetIds.some((id) => typeof id !== "string" || !id)) {
    throw new PetEvolutionError("invalid_feeders", "Choose between 1 and 50 feeder pets.", 400);
  }
  const ids = [...new Set(feederPetIds as string[])];
  if (ids.length !== feederPetIds.length) {
    throw new PetEvolutionError("duplicate_feeder", "Each feeder pet can only be selected once.", 400);
  }
  return { ids, actionId };
}

export async function feedActivePetForEvolution(userId: string, feederPetIds: unknown, actionIdInput: unknown) {
  await ensureEvolutionStorage();
  const { ids, actionId } = validateFeedRequest(feederPetIds, actionIdInput);
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actionId}))`);
    const previous = await tx.execute(sql`
      SELECT user_id, points_awarded, resulting_completed_slots, resulting_current_points
      FROM pet_evolution_feed_actions
      WHERE action_id = ${actionId}
    `);
    if (previous.rows[0]) {
      const row = previous.rows[0] as any;
      if (row.user_id !== userId) throw new PetEvolutionError("action_id_conflict", "That evolution action is already in use.", 409);
      return {
        success: true,
        alreadyCompleted: true,
        pointsAwarded: Number(row.points_awarded),
        completedSlots: Number(row.resulting_completed_slots),
        currentPoints: Number(row.resulting_current_points),
      };
    }

    const userResult = await tx.execute(sql`SELECT id, active_pet_id FROM users WHERE id = ${userId} FOR UPDATE`);
    const user = userResult.rows[0] as any;
    if (!user) throw new PetEvolutionError("user_not_found", "Player not found.", 404);
    if (!user.active_pet_id) throw new PetEvolutionError("active_pet_not_found", "Choose an active pet before evolving.", 404);

    // Lock the tables that can create protected references while feeder pets
    // are validated and consumed. This mirrors the Soul Exchange safety path.
    await tx.execute(sql`LOCK TABLE pet_equipped_accessories, player_market_listings, pvp_battle_groups,
      pet_house_positions, clearing_reward_chests, pet_cave_progress IN SHARE ROW EXCLUSIVE MODE`);

    const targetResult = await tx.execute(sql`${petStateSelect}
      WHERE ui.id = ${user.active_pet_id}
        AND ui.user_id = ${userId}
        AND si.type = 'pet'
      FOR UPDATE OF ui`);
    const target = targetResult.rows[0] as any;
    if (!target) throw new PetEvolutionError("active_pet_not_found", "The active pet could not be found.", 404);
    if (!target.isHatched) throw new PetEvolutionError("active_pet_not_hatched", "Hatch this pet before evolving it.", 409);

    await tx.execute(sql`
      INSERT INTO pet_evolution_progress(pet_inventory_id, completed_slots, current_points)
      VALUES(${target.inventoryId}, 0, 0)
      ON CONFLICT(pet_inventory_id) DO NOTHING
    `);
    const progressResult = await tx.execute(sql`
      SELECT completed_slots, current_points
      FROM pet_evolution_progress
      WHERE pet_inventory_id = ${target.inventoryId}
      FOR UPDATE
    `);
    const progress = progressResult.rows[0] as any;
    const completedSlots = Number(progress?.completed_slots ?? 0);
    const currentPoints = Number(progress?.current_points ?? 0);
    if (completedSlots >= EVOLUTION_SLOT_COUNT) {
      throw new PetEvolutionError("evolution_complete", "This pet's evolution track is already complete.", 409);
    }

    const feedersResult = await tx.execute(sql`${petStateSelect}
      WHERE ui.id IN (${idList})
        AND si.type = 'pet'
      FOR UPDATE OF ui`);
    const feederRows = feedersResult.rows as any[];
    if (feederRows.length !== ids.length || feederRows.some((row) => row.userId !== userId)) {
      throw new PetEvolutionError("feeder_not_found", "One or more selected feeder pets could not be found.", 404);
    }

    const feeders = ids.map((id) => feederRows.find((row) => row.inventoryId === id)!);
    if (feeders.some((row) => row.inventoryId === target.inventoryId)) {
      throw new PetEvolutionError("target_selected", "The active pet cannot feed itself.", 409);
    }
    for (const feeder of feeders) {
      const reason = blockedReason(feeder);
      if (reason) throw new PetEvolutionError(reason, `${feeder.nickname || feeder.name}: ${blockMessage[reason]}`, 409);
    }

    const pointsAwarded = feeders.reduce((sum, feeder) => sum + evolutionFeedPointsForRarity(feeder.rarity), 0);
    const next = applyEvolutionPoints(completedSlots, currentPoints, pointsAwarded, target.rarity);

    // Clearing chests are short-lived but use ON DELETE RESTRICT. Discarding
    // them here lets an otherwise eligible feeder pet be consumed atomically.
    await tx.execute(sql`DELETE FROM clearing_reward_chests WHERE user_id = ${userId} AND pet_inventory_id IN (${idList})`);
    const deleted = await tx.execute(sql`DELETE FROM user_inventory WHERE user_id = ${userId} AND id IN (${idList}) RETURNING id`);
    if (deleted.rows.length !== ids.length) {
      throw new PetEvolutionError("feed_conflict", "A selected feeder pet changed before evolution completed.", 409);
    }

    await tx.execute(sql`
      UPDATE pet_evolution_progress
      SET completed_slots = ${next.completedSlots}, current_points = ${next.currentPoints}, updated_at = now()
      WHERE pet_inventory_id = ${target.inventoryId}
    `);
    await tx.execute(sql`
      INSERT INTO pet_evolution_feed_actions(
        action_id, user_id, target_pet_id, feeder_pet_ids, points_awarded,
        resulting_completed_slots, resulting_current_points
      ) VALUES(
        ${actionId}, ${userId}, ${target.inventoryId}, ${JSON.stringify(ids)}::jsonb, ${pointsAwarded},
        ${next.completedSlots}, ${next.currentPoints}
      )
    `);

    return {
      success: true,
      alreadyCompleted: false,
      pointsAwarded,
      completedSlots: next.completedSlots,
      currentPoints: next.currentPoints,
      completedNow: next.completedNow,
      evolutionComplete: next.isComplete,
    };
  });
}

