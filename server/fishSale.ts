import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { playerFishInventory, shopItems, users } from "@shared/schema";

export const FISH_SELL_PRICES: Readonly<Record<number, number>> = {
  1: 5,
  2: 10,
  3: 15,
  4: 25,
  5: 30,
};

export type FishSaleFailure =
  | "fish-not-found"
  | "fish-unavailable"
  | "invalid-catalog-item";

export class FishSaleError extends Error {
  constructor(public readonly reason: FishSaleFailure) {
    super(reason);
    this.name = "FishSaleError";
  }
}

export interface FishSaleResult {
  sold: number;
  coinsEarned: number;
  newBalance: number;
}

/**
 * Sells durable fish inventory rows in one PostgreSQL transaction. Each fish
 * row represents one unit; the current inventory schema has no quantity field.
 */
export async function sellFish(userId: string, fishIds: string[]): Promise<FishSaleResult> {
  return db.transaction(async (tx) => {
    // A single player lock serializes their balance updates and establishes a
    // consistent lock order before fish rows are locked in sorted ID order.
    const [player] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!player) throw new FishSaleError("fish-not-found");

    const sortedIds = [...fishIds].sort();
    const lockedFish = await tx
      .select({
        id: playerFishInventory.id,
        ownerId: playerFishInventory.userId,
        inAquarium: playerFishInventory.inAquarium,
        itemType: shopItems.type,
        fishingType: shopItems.fishingType,
        starRarity: shopItems.starRarity,
      })
      .from(playerFishInventory)
      .leftJoin(shopItems, eq(shopItems.id, playerFishInventory.shopItemId))
      .where(inArray(playerFishInventory.id, sortedIds))
      .orderBy(playerFishInventory.id)
      .for("update", { of: playerFishInventory });

    // Missing and cross-owner IDs intentionally share one safe response.
    if (lockedFish.length !== sortedIds.length || lockedFish.some((fish) => fish.ownerId !== userId)) {
      throw new FishSaleError("fish-not-found");
    }
    if (lockedFish.some((fish) => fish.inAquarium)) {
      throw new FishSaleError("fish-unavailable");
    }
    if (lockedFish.some((fish) => fish.itemType !== "fishing" || fish.fishingType !== "fish")) {
      throw new FishSaleError("invalid-catalog-item");
    }

    const coinsEarned = lockedFish.reduce(
      (total, fish) => total + (FISH_SELL_PRICES[fish.starRarity ?? 1] ?? FISH_SELL_PRICES[1]),
      0,
    );

    const deleted = await tx
      .delete(playerFishInventory)
      .where(and(
        eq(playerFishInventory.userId, userId),
        eq(playerFishInventory.inAquarium, false),
        inArray(playerFishInventory.id, sortedIds),
      ))
      .returning({ id: playerFishInventory.id });
    if (deleted.length !== sortedIds.length) throw new FishSaleError("fish-unavailable");

    const [updatedPlayer] = await tx
      .update(users)
      .set({ coins: sql`${users.coins} + ${coinsEarned}` })
      .where(eq(users.id, userId))
      .returning({ coins: users.coins });
    if (!updatedPlayer) throw new Error("Fish sale coin credit failed");

    // Count each sold fish only after Janson's second one-time quest is accepted.
    // Progress, the inventory deletion and coin credit must commit together.
    // The quest configuration may be absent in older deployments. Use the
    // same ten-fish default shown by Janson instead of silently losing progress.
    const sellTarget = sql`COALESCE(
      (SELECT GREATEST(1, target_count) FROM daily_quests WHERE quest_key = 'sell_fish'),
      10
    )`;
    const questProgress = await tx.execute(sql`
      UPDATE user_janson_quests p
      SET progress = LEAST(${sellTarget}, p.progress + ${sortedIds.length}),
          completed_at = CASE WHEN p.progress + ${sortedIds.length} >= ${sellTarget} THEN NOW() ELSE NULL END
      WHERE p.user_id = ${userId} AND p.quest_key = 'sell_fish'
        AND p.completed_at IS NULL
      RETURNING p.completed_at
    `);
    if ((questProgress.rows[0] as { completed_at?: Date } | undefined)?.completed_at) {
      await tx.execute(sql`
        INSERT INTO user_quest_log_state (user_id, has_unseen_completion)
        VALUES (${userId}, true)
        ON CONFLICT (user_id) DO UPDATE SET has_unseen_completion = true
      `);
    }

    return { sold: sortedIds.length, coinsEarned, newBalance: updatedPlayer.coins };
  });
}
