import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import type { executeDailyQuestClaim as DailyQuestClaimExecutor } from "../dailyQuestClaim";
import { BEGIN_JOURNEY_TUTORIAL } from "../tutorial/config";

const GINNY_MINI_PET_QUEST_KEY = "ginny-mini-pet";

export interface QuestRouteDependencies {
  db: typeof database;
  isAuthenticated: RequestHandler;
  executeDailyQuestClaim: typeof DailyQuestClaimExecutor;
  getCentralDate(): string;
}

/**
 * Registers the daily-quest player and administrator HTTP routes at their
 * original position. Cross-domain progress helpers remain in routes.ts.
 */
export function registerQuestRoutes(app: Express, dependencies: QuestRouteDependencies): void {
  const { db, isAuthenticated, executeDailyQuestClaim, getCentralDate } = dependencies;
  app.get("/api/quests/daily", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const date = getCentralDate();
      const questsRes = await db.execute(sql`
        SELECT q.id, q.quest_key, q.title, q.description, q.target_count, q.coin_reward, q.reward_item_id,
               si.name AS reward_item_name, si.image_url AS reward_item_image,
               COALESCE(p.progress, 0) AS progress,
               COALESCE(p.completed, false) AS completed,
               COALESCE(p.reward_claimed, false) AS reward_claimed
        FROM daily_quests q
        LEFT JOIN user_daily_quest_progress p
          ON p.quest_key = q.quest_key AND p.user_id = ${user.id} AND p.quest_date = ${date}
        LEFT JOIN shop_items si ON si.id = q.reward_item_id
        WHERE q.is_active = true AND q.quest_key NOT IN ('catch_fish', 'sell_fish')
        ORDER BY CASE q.quest_key WHEN 'use_powerup' THEN 1 WHEN 'feed_pet' THEN 2 WHEN 'catch_fish' THEN 3 WHEN 'play_molten_blocks' THEN 4 WHEN 'sell_fish' THEN 5 ELSE 99 END
      `);
      const stateRes = await db.execute(sql`
        SELECT last_opened_date, has_unseen_completion FROM user_quest_log_state WHERE user_id = ${user.id}
      `);
      const stateRow = stateRes.rows[0] as any;
      return res.json({
        quests: questsRes.rows,
        today: date,
        lastOpenedDate: stateRow?.last_opened_date ?? null,
        hasUnseenCompletion: stateRow?.has_unseen_completion ?? false,
      });
    } catch (err) {
      console.error("Get daily quests error:", err);
      return res.status(500).json({ message: "Failed to get quests" });
    }
  });

  app.post("/api/quests/daily/seen", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const date = getCentralDate();
      await db.execute(sql`
        INSERT INTO user_quest_log_state (user_id, last_opened_date, has_unseen_completion)
        VALUES (${user.id}, ${date}, false)
        ON CONFLICT (user_id) DO UPDATE SET last_opened_date = ${date}, has_unseen_completion = false
      `);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to mark seen" });
    }
  });

  // Generic client-triggered quest progress endpoint (e.g. from MoltenBlocksPage)
  app.post("/api/daily-quests/progress", isAuthenticated, async (req, res) => {
    // Progress is only advanced by routes that have already verified the game
    // action (feeding, fishing, selling, and power-ups). Do not let a browser
    // select a quest and manufacture completion state.
    return res.status(403).json({ message: "Daily quest progress is server-authoritative" });
  });

  app.post("/api/quests/daily/claim/:questKey", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { questKey } = req.params;
      if (questKey === "catch_fish" || questKey === "sell_fish") {
        return res.status(404).json({ message: "This quest belongs to Janson" });
      }
      const date = getCentralDate();
      const claim = await db.transaction(async (tx) => {
        let progress: any;
        let quest: any;
        let newCoinBalance: number | undefined;
        const result = await executeDailyQuestClaim({
          state: async () => {
            const progressResult = await tx.execute(sql`
              SELECT * FROM user_daily_quest_progress
              WHERE user_id = ${user.id} AND quest_key = ${questKey} AND quest_date = ${date}
              FOR UPDATE
            `);
            progress = progressResult.rows[0] as any;
            if (!progress) {
              const prior = await tx.execute(sql`SELECT 1 FROM user_daily_quest_progress WHERE user_id = ${user.id} AND quest_key = ${questKey} LIMIT 1`);
              return prior.rows.length ? "expired" : "incomplete";
            }
            if (progress.reward_claimed) return "already-claimed";
            if (!progress.completed) return "incomplete";
            const questResult = await tx.execute(sql`
              SELECT q.*, si.name AS reward_item_name, si.type AS reward_item_type,
                     si.fishing_type AS reward_item_fishing_type
              FROM daily_quests q LEFT JOIN shop_items si ON si.id = q.reward_item_id
              WHERE q.quest_key = ${questKey} AND q.is_active = true
            `);
            quest = questResult.rows[0] as any;
            if (!quest) throw Object.assign(new Error("QUEST_NOT_FOUND"), { code: "QUEST_NOT_FOUND" });
            const quantity = Number(quest.reward_item_quantity ?? 1);
            if (!Number.isSafeInteger(Number(quest.coin_reward)) || Number(quest.coin_reward) < 0 ||
                (quest.reward_item_id && (!Number.isSafeInteger(quantity) || quantity < 1 || !quest.reward_item_type))) {
              throw new Error("Invalid daily quest reward configuration");
            }
            return "ready";
          },
          reserve: async () => !progress.reward_claimed,
          grantCoins: async () => {
            const amount = Number(quest.coin_reward);
            if (!amount) return;
            const updated = await tx.execute(sql`
              UPDATE users SET coins = coins + ${amount}, total_coins_earned = total_coins_earned + ${amount}
              WHERE id = ${user.id} RETURNING coins
            `);
            if (!updated.rows.length) throw new Error("User not found");
            newCoinBalance = Number((updated.rows[0] as any).coins);
          },
          grantItems: async () => {
            if (!quest.reward_item_id) return;
            const quantity = Number(quest.reward_item_quantity ?? 1);
            const durable = quest.reward_item_type === "pet" ||
              (quest.reward_item_type === "fishing" && quest.reward_item_fishing_type === "pole");
            if (durable) {
              for (let i = 0; i < quantity; i++) {
                await tx.execute(sql`INSERT INTO user_inventory (user_id, shop_item_id, quantity, hatch_started_at)
                  VALUES (${user.id}, ${quest.reward_item_id}, 1, ${quest.reward_item_type === "pet" ? sql`NOW()` : null})`);
              }
              return;
            }
            // Match the canonical stack boundary used by inventory purchases:
            // serialize the empty-row case and increment an existing stack exactly.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id})::int, hashtext(${quest.reward_item_id})::int)`);
            const stacked = await tx.execute(sql`
              UPDATE user_inventory SET quantity = COALESCE(quantity, 0) + ${quantity}
              WHERE id = (SELECT id FROM user_inventory WHERE user_id = ${user.id}
                AND shop_item_id = ${quest.reward_item_id} ORDER BY acquired_at ASC NULLS FIRST LIMIT 1)
              RETURNING id
            `);
            if (!stacked.rows.length) await tx.execute(sql`
              INSERT INTO user_inventory (user_id, shop_item_id, quantity)
              VALUES (${user.id}, ${quest.reward_item_id}, ${quantity})
            `);
          },
          commit: async () => {
            const updated = await tx.execute(sql`
              UPDATE user_daily_quest_progress SET reward_claimed = true
              WHERE user_id = ${user.id} AND quest_key = ${questKey} AND quest_date = ${date}
                AND reward_claimed = false RETURNING id
            `);
            if (!updated.rows.length) throw new Error("Claim record changed during claim");
          },
        });
        if (result === "success" && newCoinBalance === undefined) {
          const currentUser = await tx.execute(sql`SELECT coins FROM users WHERE id = ${user.id}`);
          newCoinBalance = Number((currentUser.rows[0] as any)?.coins);
        }
        return { result, quest, newCoinBalance };
      });
      if (claim.result === "incomplete") return res.status(400).json({ message: "Quest not completed" });
      if (claim.result === "expired") return res.status(400).json({ message: "Quest expired" });
      if (claim.result === "already-claimed") return res.status(400).json({ message: "Reward already claimed" });
      return res.json({
        ok: true,
        coinsGranted: claim.quest.coin_reward,
        itemGranted: claim.quest.reward_item_id ? claim.quest.reward_item_name : null,
        newCoinBalance: claim.newCoinBalance,
      });
    } catch (err: any) {
      if (err?.code === "QUEST_NOT_FOUND") return res.status(404).json({ message: "Quest not found" });
      console.error("Quest claim error:", err);
      return res.status(500).json({ message: "Failed to claim quest reward" });
    }
  });

  app.get("/api/admin/daily-quests", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const questsRes = await db.execute(sql`
        SELECT q.*, si.name AS reward_item_name, si.image_url AS reward_item_image
        FROM daily_quests q
        LEFT JOIN shop_items si ON si.id = q.reward_item_id
        ORDER BY CASE q.quest_key WHEN 'use_powerup' THEN 1 WHEN 'feed_pet' THEN 2 WHEN 'catch_fish' THEN 3 WHEN 'play_molten_blocks' THEN 4 WHEN 'sell_fish' THEN 5 ELSE 99 END
      `);
      return res.json(questsRes.rows);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get quest configs" });
    }
  });

  app.patch("/api/admin/daily-quests/:questKey", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { questKey } = req.params;
      const { coinReward, rewardItemId } = req.body;
      await db.execute(sql`
        UPDATE daily_quests
        SET coin_reward = ${coinReward ?? 0}, reward_item_id = ${rewardItemId || null}
        WHERE quest_key = ${questKey}
      `);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update quest" });
    }
  });

  // Administrator QA tools: reset a selected quest only for a moderator account.
  // This intentionally preserves inventory, coins, and already-earned rewards.
  app.get("/api/admin/moderator-quests", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });

      const [moderatorsResult, dailyQuestsResult] = await Promise.all([
        db.execute(sql`
          SELECT id, username
          FROM users
          WHERE is_moderator = true
          ORDER BY LOWER(username), username
        `),
        db.execute(sql`
          SELECT quest_key, title, is_active
          FROM daily_quests
          ORDER BY title, quest_key
        `),
      ]);

      return res.json({
        moderators: moderatorsResult.rows.map((moderator: any) => ({
          id: String(moderator.id),
          username: String(moderator.username),
        })),
        quests: [
          {
            key: BEGIN_JOURNEY_TUTORIAL.id,
            title: "Beginning Tutorial",
            kind: "tutorial",
            isActive: true,
          },
          {
            key: GINNY_MINI_PET_QUEST_KEY,
            title: "Ginny's Little Companion",
            kind: "story",
            isActive: true,
          },
          { key: "janson:catch_fish", title: "Janson: Gone Fishing", kind: "story", isActive: true },
          { key: "janson:sell_fish", title: "Janson: Sell Fish", kind: "story", isActive: true },
          ...dailyQuestsResult.rows.filter((quest: any) => !["catch_fish", "sell_fish"].includes(String(quest.quest_key))).map((quest: any) => ({
            key: String(quest.quest_key),
            title: String(quest.title),
            kind: "daily",
            isActive: quest.is_active === true,
          })),
        ],
      });
    } catch (err) {
      console.error("Get moderator quest reset options error:", err);
      return res.status(500).json({ message: "Failed to load moderator quests" });
    }
  });

  app.post("/api/admin/moderator-quests/reset", isAuthenticated, async (req, res) => {
    try {
      const admin = req.user as any;
      if (!admin.isAdmin) return res.status(403).json({ message: "Admin only" });

      const moderatorUserId = typeof req.body?.moderatorUserId === "string"
        ? req.body.moderatorUserId.trim()
        : "";
      const questKey = typeof req.body?.questKey === "string" ? req.body.questKey.trim() : "";
      if (!moderatorUserId || !questKey) {
        return res.status(400).json({ message: "Choose a moderator and quest" });
      }

      const reset = await db.transaction(async (tx) => {
        const targetResult = await tx.execute(sql`
          SELECT id, username, is_moderator
          FROM users
          WHERE id = ${moderatorUserId}
          FOR UPDATE
        `);
        const target = targetResult.rows[0] as any;
        if (!target) throw Object.assign(new Error("Moderator not found"), { status: 404 });
        if (target.is_moderator !== true) {
          throw Object.assign(new Error("Quest resets are limited to moderator accounts"), { status: 400 });
        }

        let questTitle: string;
        if (questKey === BEGIN_JOURNEY_TUTORIAL.id) {
          await tx.execute(sql`
            UPDATE users
            SET tutorial_hatch_potions_claimed = false,
                tutorial_quest_completed = false,
                tutorial_reward_claimed = false
            WHERE id = ${moderatorUserId}
          `);
          questTitle = "Beginning Tutorial";
        } else if (questKey === GINNY_MINI_PET_QUEST_KEY) {
          await tx.execute(sql`
            DELETE FROM pet_equipped_mini_pets
            WHERE mini_pet_inventory_id IN (
              SELECT mini_pet_inventory_id
              FROM user_ginny_mini_pet_quests
              WHERE user_id = ${moderatorUserId}
            )
          `);
          await tx.execute(sql`
            DELETE FROM user_ginny_mini_pet_quests
            WHERE user_id = ${moderatorUserId}
          `);
          questTitle = "Ginny's Little Companion";
        } else if (questKey === "janson:catch_fish" || questKey === "janson:sell_fish") {
          // Resetting the first chapter also resets the dependent second chapter.
          await tx.execute(sql`DELETE FROM user_janson_quests
            WHERE user_id = ${moderatorUserId}
              AND (quest_key = ${questKey === "janson:catch_fish" ? "catch_fish" : "sell_fish"}
                OR (${questKey === "janson:catch_fish"} AND quest_key = 'sell_fish'))`);
          questTitle = questKey === "janson:catch_fish" ? "Janson: Gone Fishing and Sell Fish" : "Janson: Sell Fish";
        } else {
          const questResult = await tx.execute(sql`
            SELECT title
            FROM daily_quests
            WHERE quest_key = ${questKey}
            LIMIT 1
          `);
          const quest = questResult.rows[0] as any;
          if (!quest) throw Object.assign(new Error("Quest not found"), { status: 404 });

          await tx.execute(sql`
            DELETE FROM user_daily_quest_progress
            WHERE user_id = ${moderatorUserId}
              AND quest_key = ${questKey}
              AND quest_date = ${getCentralDate()}
          `);
          await tx.execute(sql`
            UPDATE user_quest_log_state
            SET has_unseen_completion = false
            WHERE user_id = ${moderatorUserId}
          `);
          questTitle = String(quest.title);
        }

        return {
          moderatorUserId: String(target.id),
          moderatorUsername: String(target.username),
          questKey,
          questTitle,
        };
      });

      return res.json({
        ok: true,
        ...reset,
        message: `${reset.questTitle} will start over the next time @${reset.moderatorUsername} logs in.`,
      });
    } catch (err: any) {
      const status = Number(err?.status) || 500;
      if (status >= 500) console.error("Moderator quest reset error:", err);
      return res.status(status).json({
        message: status >= 500 ? "Failed to reset moderator quest" : err.message,
      });
    }
  });

}
