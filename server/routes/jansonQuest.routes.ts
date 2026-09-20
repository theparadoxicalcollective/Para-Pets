import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuthenticated } from "../auth";
import { isJansonQuestKey, jansonQuestStatus, type JansonQuestKey } from "../jansonQuestRules";

type Executor = { execute(statement: any): Promise<{ rows: any[] }> };
const QUESTS = [
  { key: "catch_fish" as const, title: "Gone Fishing", description: "Catch 5 fish", target: 5 },
  { key: "sell_fish" as const, title: "Sell Fish", description: "Sell 10 fish", target: 10 },
];

async function getState(executor: Executor, userId: string) {
  const [progressResult, configResult] = await Promise.all([
    executor.execute(sql`SELECT quest_key, progress, accepted_at, completed_at, reward_claimed_at
      FROM user_janson_quests WHERE user_id = ${userId}`),
    executor.execute(sql`SELECT q.quest_key, q.target_count, q.coin_reward, q.reward_item_id,
        q.reward_item_quantity, si.name AS reward_item_name, si.image_url AS reward_item_image
      FROM daily_quests q LEFT JOIN shop_items si ON si.id = q.reward_item_id
      WHERE q.quest_key IN ('catch_fish', 'sell_fish')`),
  ]);
  const rows = new Map(progressResult.rows.map((row: any) => [String(row.quest_key), row]));
  const configs = new Map(configResult.rows.map((row: any) => [String(row.quest_key), row]));
  const fishingClaimed = Boolean(rows.get("catch_fish")?.reward_claimed_at);
  const quests = QUESTS.map(definition => {
    const row = rows.get(definition.key);
    const config = configs.get(definition.key);
    return {
      questKey: definition.key,
      title: definition.title,
      description: definition.description,
      targetCount: Math.max(1, Number(config?.target_count) || definition.target),
      progress: Number(row?.progress ?? 0),
      status: jansonQuestStatus(definition.key, row ?? null, fishingClaimed),
      coinReward: Number(config?.coin_reward ?? 0),
      rewardItemName: config?.reward_item_name ?? null,
      rewardItemImage: config?.reward_item_image ?? null,
      rewardItemQuantity: Number(config?.reward_item_quantity ?? 1),
    };
  });
  return { quests, marketUnlocked: Boolean(rows.get("sell_fish")) && fishingClaimed };
}

function errorResponse(res: Response, error: any, action: string) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(`[janson-quest] ${action} failed`, error);
  return res.status(status).json({ message: status >= 500 ? `Failed to ${action}` : error.message });
}

export function registerJansonQuestRoutes(app: Express): void {
  app.get("/api/quests/janson", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      return res.json(await getState(db, (req.user as any).id));
    } catch (error) {
      return errorResponse(res, error, "load Janson's quests");
    }
  });

  app.post("/api/quests/janson/:questKey/start", requireAuthenticated, async (req: Request, res: Response) => {
    const key = req.params.questKey;
    if (!isJansonQuestKey(key)) return res.status(404).json({ message: "Quest not found" });
    const userId = (req.user as any).id as string;
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
        if (key === "sell_fish") {
          const prior = await tx.execute(sql`SELECT reward_claimed_at FROM user_janson_quests
            WHERE user_id = ${userId} AND quest_key = 'catch_fish'`);
          if (!prior.rows[0]?.reward_claimed_at) {
            throw Object.assign(new Error("Finish and claim Gone Fishing first"), { status: 409 });
          }
        }
        await tx.execute(sql`INSERT INTO user_janson_quests (user_id, quest_key)
          VALUES (${userId}, ${key}) ON CONFLICT (user_id, quest_key) DO NOTHING`);
      });
      return res.json(await getState(db, userId));
    } catch (error) {
      return errorResponse(res, error, "start Janson's quest");
    }
  });

  app.post("/api/quests/janson/:questKey/claim", requireAuthenticated, async (req: Request, res: Response) => {
    const key = req.params.questKey;
    if (!isJansonQuestKey(key)) return res.status(404).json({ message: "Quest not found" });
    const userId = (req.user as any).id as string;
    try {
      const reward = await db.transaction(async tx => {
        const progress = await tx.execute(sql`SELECT completed_at, reward_claimed_at FROM user_janson_quests
          WHERE user_id = ${userId} AND quest_key = ${key} FOR UPDATE`);
        const row = progress.rows[0] as any;
        if (!row?.completed_at) throw Object.assign(new Error("Quest not completed"), { status: 400 });
        if (row.reward_claimed_at) throw Object.assign(new Error("Reward already claimed"), { status: 409 });
        const configResult = await tx.execute(sql`SELECT q.coin_reward, q.reward_item_id, q.reward_item_quantity,
            si.name AS reward_item_name, si.type AS reward_item_type, si.fishing_type AS reward_item_fishing_type
          FROM daily_quests q LEFT JOIN shop_items si ON si.id = q.reward_item_id
          WHERE q.quest_key = ${key}`);
        const config = configResult.rows[0] as any;
        if (!config) throw new Error("Janson reward configuration is missing");
        const coins = Number(config.coin_reward);
        const quantity = Number(config.reward_item_quantity ?? 1);
        if (!Number.isSafeInteger(coins) || coins < 0 ||
            (config.reward_item_id && (!config.reward_item_type || !Number.isSafeInteger(quantity) || quantity < 1))) {
          throw new Error("Invalid Janson reward configuration");
        }
        let newCoinBalance: number | undefined;
        if (coins) {
          const updated = await tx.execute(sql`UPDATE users SET coins = coins + ${coins},
            total_coins_earned = total_coins_earned + ${coins} WHERE id = ${userId} RETURNING coins`);
          if (!updated.rows[0]) throw new Error("Player not found");
          newCoinBalance = Number((updated.rows[0] as any).coins);
        }
        if (config.reward_item_id) {
          const durable = config.reward_item_type === "pet" ||
            (config.reward_item_type === "fishing" && config.reward_item_fishing_type === "pole");
          if (durable) {
            for (let i = 0; i < quantity; i++) {
              await tx.execute(sql`INSERT INTO user_inventory (user_id, shop_item_id, quantity, hatch_started_at)
                VALUES (${userId}, ${config.reward_item_id}, 1, ${config.reward_item_type === "pet" ? sql`NOW()` : null})`);
            }
          } else {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::int, hashtext(${config.reward_item_id})::int)`);
            const stack = await tx.execute(sql`UPDATE user_inventory SET quantity = COALESCE(quantity, 0) + ${quantity}
              WHERE id = (SELECT id FROM user_inventory WHERE user_id = ${userId}
                AND shop_item_id = ${config.reward_item_id} ORDER BY acquired_at ASC NULLS FIRST LIMIT 1) RETURNING id`);
            if (!stack.rows[0]) await tx.execute(sql`INSERT INTO user_inventory (user_id, shop_item_id, quantity)
              VALUES (${userId}, ${config.reward_item_id}, ${quantity})`);
          }
        }
        const claimed = await tx.execute(sql`UPDATE user_janson_quests SET reward_claimed_at = NOW()
          WHERE user_id = ${userId} AND quest_key = ${key} AND reward_claimed_at IS NULL RETURNING quest_key`);
        if (!claimed.rows[0]) throw new Error("Claim changed during transaction");
        if (newCoinBalance === undefined) {
          const balance = await tx.execute(sql`SELECT coins FROM users WHERE id = ${userId}`);
          newCoinBalance = Number((balance.rows[0] as any)?.coins);
        }
        return { coinsGranted: coins, itemGranted: config.reward_item_name ?? null, newCoinBalance };
      });
      return res.json({ ok: true, ...reward, ...(await getState(db, userId)) });
    } catch (error) {
      return errorResponse(res, error, "claim Janson's reward");
    }
  });
}
