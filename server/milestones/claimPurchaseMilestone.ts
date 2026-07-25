import { sql } from "drizzle-orm";
import { db } from "../db";
import { purchaseMilestoneById, type PurchaseMilestoneDefinition } from "./config";
import { PurchaseMilestoneError } from "./errors";

export type PurchaseMilestoneReward = {
  coins: number;
  itemId: string | null;
  itemName: string | null;
  itemImageUrl: string | null;
};

export type PurchaseMilestoneClaimResult = {
  status: "claimed" | "already_claimed";
  milestoneId: string;
  cycleKey: string;
  qualifyingPoints: number;
  claimedAt: string;
  reward: PurchaseMilestoneReward;
  coinBalance: number;
};

export type PurchaseMilestoneClaimOperations = {
  run(input: { playerId: string; milestone: PurchaseMilestoneDefinition }): Promise<Omit<PurchaseMilestoneClaimResult, "milestoneId">>;
};

export async function executePurchaseMilestoneClaim(
  playerId: string,
  milestoneId: string,
  operations: PurchaseMilestoneClaimOperations,
): Promise<PurchaseMilestoneClaimResult> {
  const milestone = purchaseMilestoneById(milestoneId);
  if (!milestone) throw new PurchaseMilestoneError("unknown_milestone", "Unknown milestone");
  const result = await operations.run({ playerId, milestone });
  return { ...result, milestoneId: milestone.id };
}

type RewardRow = {
  reward_coins: number | null;
  reward_item_id: string | null;
  reward_item_name: string | null;
  reward_item_image_url: string | null;
  item_type: string | null;
  fishing_type: string | null;
};

export async function claimPurchaseMilestone(playerId: string, milestoneId: string): Promise<PurchaseMilestoneClaimResult> {
  return executePurchaseMilestoneClaim(playerId, milestoneId, {
    async run({ playerId, milestone }) {
      return db.transaction(async (tx) => {
        // Match Stripe fulfillment's lock order: player, contribution cycle,
        // progress, claim boundary, reward configuration, then inventory.
        const playerResult = await tx.execute(sql`SELECT id, coins FROM users WHERE id = ${playerId} FOR UPDATE`);
        const player = playerResult.rows[0] as { id: string; coins: number } | undefined;
        if (!player) throw new PurchaseMilestoneError("transaction_failure", "Player is unavailable");

        await tx.execute(sql`
          INSERT INTO user_contribution_cycles (user_id, cycle) VALUES (${playerId}, 1)
          ON CONFLICT (user_id) DO NOTHING
        `);
        const cycleResult = await tx.execute(sql`
          SELECT cycle FROM user_contribution_cycles WHERE user_id = ${playerId} FOR UPDATE
        `);
        const cycle = Number((cycleResult.rows[0] as any)?.cycle);
        if (!Number.isSafeInteger(cycle) || cycle < 1) {
          throw new PurchaseMilestoneError("invalid_legacy_claim_state", "Contribution cycle is invalid");
        }
        const cycleKey = `c-${cycle}`;

        const progressResult = await tx.execute(sql`
          SELECT points FROM purchase_monthly_progress
          WHERE user_id = ${playerId} AND month_year = ${cycleKey}
          FOR UPDATE
        `);
        const qualifyingPoints = Number((progressResult.rows[0] as any)?.points ?? 0);

        const existingResult = await tx.execute(sql`
          SELECT claimed_at FROM purchase_milestone_claims
          WHERE user_id = ${playerId} AND milestone_points = ${milestone.threshold} AND month_year = ${cycleKey}
          FOR UPDATE
        `);

        const rewardResult = await tx.execute(sql`
          SELECT pmr.reward_coins, pmr.reward_item_id, pmr.reward_item_name, pmr.reward_item_image_url,
                 si.type AS item_type, si.fishing_type
          FROM purchase_milestone_rewards pmr
          LEFT JOIN shop_items si ON si.id = pmr.reward_item_id
          WHERE pmr.milestone_points = ${milestone.threshold}
          FOR SHARE OF pmr
        `);
        const rewardRow = rewardResult.rows[0] as RewardRow | undefined;
        if (!rewardRow) throw new PurchaseMilestoneError("missing_reward_configuration", "Milestone reward is not configured");
        const coins = Number(rewardRow.reward_coins ?? 0);
        if (!Number.isSafeInteger(coins) || coins < 0) {
          throw new PurchaseMilestoneError("invalid_reward_configuration", "Milestone reward configuration is invalid");
        }
        if (rewardRow.reward_item_id && !rewardRow.item_type) {
          throw new PurchaseMilestoneError("invalid_reward_configuration", "Milestone reward item is unavailable");
        }
        const reward: PurchaseMilestoneReward = {
          coins,
          itemId: rewardRow.reward_item_id,
          itemName: rewardRow.reward_item_name,
          itemImageUrl: rewardRow.reward_item_image_url,
        };

        if (existingResult.rows[0]) {
          return {
            status: "already_claimed" as const,
            cycleKey,
            qualifyingPoints,
            claimedAt: new Date((existingResult.rows[0] as any).claimed_at).toISOString(),
            reward,
            coinBalance: Number(player.coins),
          };
        }

        // A retry after the final milestone advanced the cycle reconciles to
        // the immediately preceding committed claim while the new cycle has
        // not itself qualified. Once the new cycle qualifies it is claimable.
        if (milestone.advancesCycle && qualifyingPoints < milestone.threshold && cycle > 1) {
          const prior = await tx.execute(sql`
            SELECT claimed_at FROM purchase_milestone_claims
            WHERE user_id = ${playerId} AND milestone_points = ${milestone.threshold}
              AND month_year = ${`c-${cycle - 1}`}
            FOR UPDATE
          `);
          if (prior.rows[0]) {
            return {
              status: "already_claimed" as const,
              cycleKey: `c-${cycle - 1}`,
              qualifyingPoints: milestone.threshold,
              claimedAt: new Date((prior.rows[0] as any).claimed_at).toISOString(),
              reward,
              coinBalance: Number(player.coins),
            };
          }
        }

        if (qualifyingPoints < milestone.threshold) {
          throw new PurchaseMilestoneError("not_qualified", "Milestone not yet reached");
        }

        let coinBalance = Number(player.coins);
        if (coins > 0) {
          const updated = await tx.execute(sql`
            UPDATE users SET coins = coins + ${coins}, total_coins_earned = total_coins_earned + ${coins}
            WHERE id = ${playerId} RETURNING coins
          `);
          if (!updated.rows[0]) throw new PurchaseMilestoneError("reward_grant_failure", "Unable to grant milestone reward");
          coinBalance = Number((updated.rows[0] as any).coins);
        }

        if (rewardRow.reward_item_id) {
          const isIndividual = rewardRow.item_type === "pet"
            || (rewardRow.item_type === "fishing" && rewardRow.fishing_type === "pole");
          if (isIndividual) {
            await tx.execute(sql`
              INSERT INTO user_inventory (user_id, shop_item_id, quantity, hatch_started_at)
              VALUES (${playerId}, ${rewardRow.reward_item_id}, 1,
                ${rewardRow.item_type === "pet" ? new Date() : null})
            `);
          } else {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${playerId}), hashtext(${rewardRow.reward_item_id}))`);
            const stacked = await tx.execute(sql`
              SELECT id FROM user_inventory
              WHERE user_id = ${playerId} AND shop_item_id = ${rewardRow.reward_item_id}
              ORDER BY acquired_at, id LIMIT 1 FOR UPDATE
            `);
            if (stacked.rows[0]) {
              await tx.execute(sql`
                UPDATE user_inventory SET quantity = COALESCE(quantity, 0) + 1
                WHERE id = ${(stacked.rows[0] as any).id}
              `);
            } else {
              await tx.execute(sql`
                INSERT INTO user_inventory (user_id, shop_item_id, quantity)
                VALUES (${playerId}, ${rewardRow.reward_item_id}, 1)
              `);
            }
          }
        }

        const claimResult = await tx.execute(sql`
          INSERT INTO purchase_milestone_claims (user_id, milestone_points, month_year)
          VALUES (${playerId}, ${milestone.threshold}, ${cycleKey})
          ON CONFLICT (user_id, milestone_points, month_year) DO NOTHING
          RETURNING claimed_at
        `);
        if (!claimResult.rows[0]) throw new PurchaseMilestoneError("concurrent_conflict", "Milestone claim conflict");

        if (milestone.advancesCycle) {
          const advanced = await tx.execute(sql`
            UPDATE user_contribution_cycles SET cycle = cycle + 1
            WHERE user_id = ${playerId} AND cycle = ${cycle}
            RETURNING cycle
          `);
          if (!advanced.rows[0]) throw new PurchaseMilestoneError("concurrent_conflict", "Milestone cycle conflict");
        }

        return {
          status: "claimed" as const,
          cycleKey,
          qualifyingPoints,
          claimedAt: new Date((claimResult.rows[0] as any).claimed_at).toISOString(),
          reward,
          coinBalance,
        };
      });
    },
  });
}
