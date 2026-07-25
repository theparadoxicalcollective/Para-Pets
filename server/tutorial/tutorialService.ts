import { sql } from "drizzle-orm";
import { db } from "../db";
import { BEGIN_JOURNEY_TUTORIAL } from "./config";
import { TutorialError } from "./errors";

export type TutorialPotionGrantResult = {
  status: "granted" | "already_granted";
  tutorialId: string;
  itemId: string;
  quantity: number;
};

export type TutorialCompletionResult = {
  status: "completed" | "already_completed";
  tutorialId: string;
};

export type TutorialRewardClaimResult = {
  status: "claimed" | "already_claimed";
  tutorialId: string;
  coins: number;
  coinBalance: number;
};

export type TutorialOperations = {
  grantHatchPotions(playerId: string): Promise<"granted" | "already_granted">;
  complete(playerId: string): Promise<"completed" | "already_completed">;
  claimQuestReward(playerId: string): Promise<Omit<TutorialRewardClaimResult, "tutorialId">>;
};

export async function executeTutorialHatchPotionGrant(
  playerId: string,
  operations: Pick<TutorialOperations, "grantHatchPotions">,
): Promise<TutorialPotionGrantResult> {
  const status = await operations.grantHatchPotions(playerId);
  return {
    status,
    tutorialId: BEGIN_JOURNEY_TUTORIAL.id,
    itemId: BEGIN_JOURNEY_TUTORIAL.hatchPotion.itemId,
    quantity: BEGIN_JOURNEY_TUTORIAL.hatchPotion.quantity,
  };
}

export async function executeTutorialCompletion(
  playerId: string,
  operations: Pick<TutorialOperations, "complete">,
): Promise<TutorialCompletionResult> {
  return {
    status: await operations.complete(playerId),
    tutorialId: BEGIN_JOURNEY_TUTORIAL.id,
  };
}

export async function executeTutorialRewardClaim(
  playerId: string,
  operations: Pick<TutorialOperations, "claimQuestReward">,
): Promise<TutorialRewardClaimResult> {
  return {
    ...(await operations.claimQuestReward(playerId)),
    tutorialId: BEGIN_JOURNEY_TUTORIAL.id,
  };
}

const postgresTutorialOperations: TutorialOperations = {
  async grantHatchPotions(playerId) {
    return db.transaction(async (tx) => {
      const playerResult = await tx.execute(sql`
        SELECT COALESCE(tutorial_hatch_potions_claimed, false) AS claimed
        FROM users WHERE id = ${playerId} FOR UPDATE
      `);
      const player = playerResult.rows[0] as { claimed: boolean } | undefined;
      if (!player) throw new TutorialError("player_not_found", "Player is unavailable");
      if (player.claimed) return "already_granted" as const;

      const itemResult = await tx.execute(sql`
        SELECT id FROM shop_items
        WHERE id = ${BEGIN_JOURNEY_TUTORIAL.hatchPotion.itemId}
          AND type = 'special'
          AND special_type = ${BEGIN_JOURNEY_TUTORIAL.hatchPotion.specialType}
        FOR SHARE
      `);
      if (!itemResult.rows[0]) {
        throw new TutorialError("reward_item_unavailable", "Tutorial reward is unavailable");
      }

      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${playerId}), hashtext(${BEGIN_JOURNEY_TUTORIAL.hatchPotion.itemId}))`);
      const stackResult = await tx.execute(sql`
        SELECT id FROM user_inventory
        WHERE user_id = ${playerId} AND shop_item_id = ${BEGIN_JOURNEY_TUTORIAL.hatchPotion.itemId}
        ORDER BY acquired_at, id LIMIT 1 FOR UPDATE
      `);
      if (stackResult.rows[0]) {
        await tx.execute(sql`
          UPDATE user_inventory
          SET quantity = COALESCE(quantity, 0) + ${BEGIN_JOURNEY_TUTORIAL.hatchPotion.quantity}
          WHERE id = ${(stackResult.rows[0] as any).id}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO user_inventory (user_id, shop_item_id, quantity)
          VALUES (${playerId}, ${BEGIN_JOURNEY_TUTORIAL.hatchPotion.itemId}, ${BEGIN_JOURNEY_TUTORIAL.hatchPotion.quantity})
        `);
      }

      const claimed = await tx.execute(sql`
        UPDATE users SET tutorial_hatch_potions_claimed = true
        WHERE id = ${playerId} AND COALESCE(tutorial_hatch_potions_claimed, false) = false
        RETURNING id
      `);
      if (!claimed.rows[0]) throw new TutorialError("transaction_failure", "Tutorial grant could not be recorded");
      return "granted" as const;
    });
  },

  async complete(playerId) {
    return db.transaction(async (tx) => {
      const playerResult = await tx.execute(sql`
        SELECT COALESCE(tutorial_quest_completed, false) AS completed
        FROM users WHERE id = ${playerId} FOR UPDATE
      `);
      const player = playerResult.rows[0] as { completed: boolean } | undefined;
      if (!player) throw new TutorialError("player_not_found", "Player is unavailable");
      if (player.completed) return "already_completed" as const;
      const completed = await tx.execute(sql`
        UPDATE users SET tutorial_quest_completed = true
        WHERE id = ${playerId} AND COALESCE(tutorial_quest_completed, false) = false
        RETURNING id
      `);
      if (!completed.rows[0]) throw new TutorialError("transaction_failure", "Tutorial completion could not be recorded");
      return "completed" as const;
    });
  },

  async claimQuestReward(playerId) {
    return db.transaction(async (tx) => {
      const playerResult = await tx.execute(sql`
        SELECT coins, COALESCE(tutorial_quest_completed, false) AS completed,
               COALESCE(tutorial_reward_claimed, false) AS claimed
        FROM users WHERE id = ${playerId} FOR UPDATE
      `);
      const player = playerResult.rows[0] as { coins: number; completed: boolean; claimed: boolean } | undefined;
      if (!player) throw new TutorialError("player_not_found", "Player is unavailable");
      if (!player.completed) throw new TutorialError("tutorial_not_completed", "Tutorial is not complete");
      if (player.claimed) {
        return { status: "already_claimed" as const, coins: 0, coinBalance: Number(player.coins) };
      }
      const updated = await tx.execute(sql`
        UPDATE users
        SET coins = coins + ${BEGIN_JOURNEY_TUTORIAL.questLogRewardCoins},
            total_coins_earned = total_coins_earned + ${BEGIN_JOURNEY_TUTORIAL.questLogRewardCoins},
            tutorial_reward_claimed = true
        WHERE id = ${playerId} AND tutorial_quest_completed = true
          AND COALESCE(tutorial_reward_claimed, false) = false
        RETURNING coins
      `);
      if (!updated.rows[0]) throw new TutorialError("transaction_failure", "Tutorial reward could not be claimed");
      return {
        status: "claimed" as const,
        coins: BEGIN_JOURNEY_TUTORIAL.questLogRewardCoins,
        coinBalance: Number((updated.rows[0] as any).coins),
      };
    });
  },
};

export const grantTutorialHatchPotions = (playerId: string) =>
  executeTutorialHatchPotionGrant(playerId, postgresTutorialOperations);

export const completeTutorial = (playerId: string) =>
  executeTutorialCompletion(playerId, postgresTutorialOperations);

export const claimTutorialReward = (playerId: string) =>
  executeTutorialRewardClaim(playerId, postgresTutorialOperations);
