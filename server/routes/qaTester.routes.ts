import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuthenticated } from "../auth";
import { isDedicatedQaTester } from "../qaTester";
import { resetMoltenBlocksRewardState } from "./moltenBlocks.routes";
import { LONELLE_KEY } from "../lonelleQuest";

const NPC_DISCOVERY_TOUR_RESET_PREFIX = "npc_discovery_tour_reset:";
const HAUNTED_SLOTS_FREE_PREFIX = "haunted_slots_free_500_v1:";

function denyUnlessQa(req: any, res: any): boolean {
  if (isDedicatedQaTester(req.user)) return false;
  res.status(403).json({ message: "QA tester account only" });
  return true;
}

/**
 * Self-only tools for the reserved QA player. These routes never accept a
 * target user id, so the QA account cannot use them to mutate another player.
 */
export function registerQaTesterRoutes(app: Express): void {
  app.get("/api/qa/status", requireAuthenticated, async (req, res) => {
    if (denyUnlessQa(req, res)) return;
    return res.json({
      enabled: true,
      role: "qa-tester",
      moderatorBadge: true,
      canAffectOtherPlayers: false,
      realMoneyCheckoutBlocked: true,
      tools: {
        resetQuests: true,
        resetDailyMiniGames: true,
        grantSelfTestResources: true,
      },
    });
  });

  app.post("/api/qa/reset/quests", requireAuthenticated, async (req, res) => {
    if (denyUnlessQa(req, res)) return;
    const user = req.user as any;

    try {
      await db.transaction(async (tx) => {
        // Match the existing admin moderator-reset behavior: restart QA state
        // without clawing back already-earned inventory, coins, or rewards.
        await tx.execute(sql`
          UPDATE users
          SET tutorial_hatch_potions_claimed = false,
              tutorial_quest_completed = false,
              tutorial_reward_claimed = false
          WHERE id = ${user.id}
        `);

        await tx.execute(sql`DELETE FROM pet_home_tutorial_progress WHERE user_id = ${user.id}`);

        await tx.execute(sql`
          DELETE FROM pet_equipped_mini_pets
          WHERE mini_pet_inventory_id IN (
            SELECT mini_pet_inventory_id
            FROM user_ginny_mini_pet_quests
            WHERE user_id = ${user.id}
          )
        `);
        await tx.execute(sql`DELETE FROM user_ginny_mini_pet_quests WHERE user_id = ${user.id}`);
        await tx.execute(sql`DELETE FROM user_janson_quests WHERE user_id = ${user.id}`);
        await tx.execute(sql`DELETE FROM user_janson_daily_quests WHERE user_id = ${user.id}`);
        await tx.execute(sql`DELETE FROM user_daily_quest_progress WHERE user_id = ${user.id}`);
        await tx.execute(sql`
          UPDATE user_quest_log_state
          SET has_unseen_completion = false
          WHERE user_id = ${user.id}
        `);

        // Lonelle stores progress in game_settings.
        await tx.execute(sql`DELETE FROM game_settings WHERE key = ${LONELLE_KEY(String(user.id))}`);

        // The NPC discovery guide restarts when its per-player token changes.
        const discoveryKey = NPC_DISCOVERY_TOUR_RESET_PREFIX + String(user.id);
        await tx.execute(sql`
          INSERT INTO game_settings (key, value)
          VALUES (${discoveryKey}, gen_random_uuid()::text)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `);
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error("[qa] quest reset failed", error);
      return res.status(500).json({ message: "Failed to reset QA quest state" });
    }
  });

  app.post("/api/qa/reset/daily-minigames", requireAuthenticated, async (req, res) => {
    if (denyUnlessQa(req, res)) return;
    const user = req.user as any;

    try {
      await db.transaction(async (tx) => {
        // QA history is intentionally disposable. Deleting only this QA
        // player's records restores the daily free/test states without
        // changing any real player's game history or rewards.
        await tx.execute(sql`DELETE FROM beau_prize_wheel_spins WHERE user_id = ${user.id}`);
        await tx.execute(sql`DELETE FROM haunted_bingo_rounds WHERE user_id = ${user.id}`);

        const slotKey = HAUNTED_SLOTS_FREE_PREFIX + String(user.id);
        await tx.execute(sql`DELETE FROM game_settings WHERE key = ${slotKey}`);
      });

      resetMoltenBlocksRewardState(String(user.id));
      return res.json({ ok: true });
    } catch (error) {
      console.error("[qa] mini-game reset failed", error);
      return res.status(500).json({ message: "Failed to reset QA mini-game state" });
    }
  });

  app.post("/api/qa/grant", requireAuthenticated, async (req, res) => {
    if (denyUnlessQa(req, res)) return;
    const user = req.user as any;

    const coins = req.body?.coins === undefined ? 0 : Number(req.body.coins);
    const shopItemId = typeof req.body?.shopItemId === "string" ? req.body.shopItemId.trim() : "";
    const quantity = req.body?.quantity === undefined ? 1 : Number(req.body.quantity);

    if (!Number.isSafeInteger(coins) || coins < 0 || coins > 100000) {
      return res.status(400).json({ message: "coins must be an integer from 0 to 100000" });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ message: "quantity must be an integer from 1 to 20" });
    }
    if (!coins && !shopItemId) {
      return res.status(400).json({ message: "Choose test coins and/or an item" });
    }

    try {
      if (coins) {
        // Do not increment total_coins_earned: QA funding must not inflate
        // progression/earnings statistics or reward milestones.
        await db.execute(sql`UPDATE users SET coins = coins + ${coins} WHERE id = ${user.id}`);
      }

      let grantedItem: { id: string; name: string; quantity: number } | null = null;
      if (shopItemId) {
        const item = await storage.getShopItem(shopItemId);
        if (!item) return res.status(404).json({ message: "Item not found" });

        const isDurablePole = item.type === "fishing" && item.fishingType === "pole";
        if (item.type === "pet" || isDurablePole) {
          for (let i = 0; i < quantity; i++) {
            await storage.addToInventory(
              user.id,
              shopItemId,
              isDurablePole ? { poleUsesLeft: item.poleMaxUses ?? null } : undefined,
            );
          }
        } else {
          await storage.addToInventory(user.id, shopItemId, undefined, quantity);
        }
        grantedItem = { id: item.id, name: item.name, quantity };
      }

      const current = await storage.getUser(user.id);
      return res.json({
        ok: true,
        coins: current?.coins ?? null,
        coinsGranted: coins,
        itemGranted: grantedItem,
      });
    } catch (error) {
      console.error("[qa] self grant failed", error);
      return res.status(500).json({ message: "Failed to grant QA test resources" });
    }
  });
}
