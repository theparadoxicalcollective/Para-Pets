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

    // Preserve the existing one sell_fish progress increment per fish, but
    // make it part of the sale transaction so progress cannot describe a sale
    // whose inventory/coin mutations rolled back.
    const questProgress = await tx.execute(sql`
      INSERT INTO user_daily_quest_progress (user_id, quest_key, quest_date, progress, completed)
      SELECT ${userId}, 'sell_fish',
             (CURRENT_TIMESTAMP AT TIME ZONE 'America/Chicago')::date,
             LEAST(dq.target_count, ${sortedIds.length}),
             ${sortedIds.length} >= dq.target_count
      FROM daily_quests dq
      WHERE dq.quest_key = 'sell_fish' AND dq.is_active = true
      ON CONFLICT (user_id, quest_key, quest_date) DO UPDATE
      SET progress = CASE
            WHEN user_daily_quest_progress.completed THEN user_daily_quest_progress.progress
            ELSE LEAST(
              (SELECT target_count FROM daily_quests WHERE quest_key = 'sell_fish'),
              user_daily_quest_progress.progress + ${sortedIds.length}
            )
          END,
          completed = CASE
            WHEN user_daily_quest_progress.completed THEN true
            ELSE user_daily_quest_progress.progress + ${sortedIds.length} >=
              (SELECT target_count FROM daily_quests WHERE quest_key = 'sell_fish')
          END
      RETURNING completed
    `);
    if ((questProgress.rows[0] as { completed?: boolean } | undefined)?.completed) {
      await tx.execute(sql`
        INSERT INTO user_quest_log_state (user_id, has_unseen_completion)
        VALUES (${userId}, true)
        ON CONFLICT (user_id) DO UPDATE SET has_unseen_completion = true
      `);
    }

    return { sold: sortedIds.length, coinsEarned, newBalance: updatedPlayer.coins };
  });
}
