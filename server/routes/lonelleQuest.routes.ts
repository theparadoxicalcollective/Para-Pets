import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuthenticated } from "../auth";
import { LONELLE_KEY, LONELLE_REQUIRED_KILLS, LONELLE_REWARD_COINS, parseLonelleProgress } from "../lonelleQuest";

type Executor = { execute(statement: any): Promise<{ rows: any[] }> };
const SCARF_NAMES = ["lonelle’s scarf", "lonelle's scarf"];

async function catalog(executor: Executor, names: string[]) {
  const [first, second] = names;
  const result = await executor.execute(sql`
    SELECT id, name, image_url FROM shop_items
    WHERE type='costume' AND LOWER(TRIM(name)) IN (${first}, ${second ?? first})
    ORDER BY created_at ASC LIMIT 1
  `);
  return result.rows[0] as { id: string; name: string; image_url: string | null } | undefined;
}

async function state(executor: Executor, userId: string) {
  const [stored, scarf, reward, npc] = await Promise.all([
    executor.execute(sql`SELECT value FROM game_settings WHERE key=${LONELLE_KEY(userId)}`),
    catalog(executor, SCARF_NAMES),
    catalog(executor, ["firefly cluster"]),
    executor.execute(sql`SELECT id, image_url FROM shop_items WHERE type='npc' AND LOWER(TRIM(name))='lonelle' ORDER BY created_at ASC LIMIT 1`),
  ]);
  const progress = parseLonelleProgress(stored.rows[0]?.value);
  const scarfId = progress?.scarfInventoryId;
  const owned = scarfId ? await executor.execute(sql`
    SELECT id FROM user_inventory WHERE id=${scarfId} AND user_id=${userId} AND is_listed=false LIMIT 1
  `) : null;
  const equipped = scarfId ? await executor.execute(sql`
    SELECT ec.pet_inventory_id FROM pet_equipped_costumes ec
    JOIN user_inventory pet ON pet.id=ec.pet_inventory_id AND pet.user_id=${userId}
    WHERE ec.costume_inventory_id=${scarfId} AND ec.slot=3 LIMIT 1
  `) : null;
  const npcRow = npc.rows[0] as { id: string; image_url: string | null } | undefined;
  const phases = npcRow ? await executor.execute(sql`
    SELECT phase, image_url FROM npc_phases WHERE npc_id=${npcRow.id}
  `) : null;
  return {
    key: "lonelle_lost_adornment", title: "Lost Adornment", worldId: "swamp", npcName: "Lonelle",
    status: progress?.status ?? "available", kills: progress?.kills ?? 0, requiredKills: LONELLE_REQUIRED_KILLS,
    scarfInventoryId: scarfId ?? null, scarfOwned: Boolean(owned?.rows[0]), scarfEquipped: Boolean(equipped?.rows[0]),
    scarf: scarf ? { name: scarf.name, imageUrl: scarf.image_url } : null,
    reward: reward ? { name: reward.name, imageUrl: reward.image_url, coins: LONELLE_REWARD_COINS } : null,
    configured: Boolean(scarf && reward),
    npcImageUrl: npcRow?.image_url ?? null,
    npcPhases: Object.fromEntries((phases?.rows ?? []).map((row: any) => [row.phase, row.image_url])),
  };
}

function errorResponse(res: Response, error: any, action: string) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(`[lonelle-quest] ${action} failed`, error);
  return res.status(status).json({ message: status >= 500 ? `Could not ${action} Lonelle's quest` : error.message });
}
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }

export function registerLonelleQuestRoutes(app: Express): void {
  app.get("/api/quests/lonelle-lost-adornment", requireAuthenticated, async (req: Request, res: Response) => {
    try { return res.json(await state(db as unknown as Executor, (req.user as { id: string }).id)); }
    catch (error) { return errorResponse(res, error, "load"); }
  });

  app.post("/api/quests/lonelle-lost-adornment/start", requireAuthenticated, async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    try {
      await db.transaction(async tx => {
        const executor = tx as unknown as Executor;
        await executor.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
        const [scarf, reward] = await Promise.all([catalog(executor, SCARF_NAMES), catalog(executor, ["firefly cluster"])]);
        if (!scarf || !reward) fail("Lonelle's scarf or Firefly Cluster is not configured yet");
        await executor.execute(sql`
          INSERT INTO game_settings(key,value)
          VALUES (${LONELLE_KEY(userId)}, ${JSON.stringify({ status: "accepted", kills: 0, scarfInventoryId: null })})
          ON CONFLICT (key) DO NOTHING
        `);
      });
      return res.json(await state(db as unknown as Executor, userId));
    } catch (error) { return errorResponse(res, error, "start"); }
  });

  app.post("/api/quests/lonelle-lost-adornment/take", requireAuthenticated, async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    try {
      await db.transaction(async tx => {
        const executor = tx as unknown as Executor;
        const stored = await executor.execute(sql`SELECT value FROM game_settings WHERE key=${LONELLE_KEY(userId)} FOR UPDATE`);
        const progress = parseLonelleProgress(stored.rows[0]?.value);
        if (!progress || !["found", "taken"].includes(progress.status) || progress.kills < LONELLE_REQUIRED_KILLS) fail("Defeat five Clearing monsters first");
        if (progress.scarfInventoryId) {
          const existing = await executor.execute(sql`SELECT id FROM user_inventory WHERE id=${progress.scarfInventoryId} AND user_id=${userId} AND is_listed=false`);
          if (existing.rows[0]) {
            if (progress.status === "found") await executor.execute(sql`
              UPDATE game_settings SET value=${JSON.stringify({ ...progress, status: "taken" })} WHERE key=${LONELLE_KEY(userId)}
            `);
            return;
          }
        }
        const scarf = await catalog(executor, SCARF_NAMES);
        if (!scarf) fail("Lonelle's Scarf is unavailable");
        const granted = await executor.execute(sql`
          INSERT INTO user_inventory(user_id,shop_item_id,quantity) VALUES (${userId},${scarf.id},1) RETURNING id
        `);
        const next = { status: "taken", kills: LONELLE_REQUIRED_KILLS, scarfInventoryId: String(granted.rows[0].id) };
        await executor.execute(sql`UPDATE game_settings SET value=${JSON.stringify(next)} WHERE key=${LONELLE_KEY(userId)}`);
      });
      return res.json(await state(db as unknown as Executor, userId));
    } catch (error) { return errorResponse(res, error, "retrieve"); }
  });

  app.post("/api/quests/lonelle-lost-adornment/claim", requireAuthenticated, async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    try {
      const claimed = await db.transaction(async tx => {
        const executor = tx as unknown as Executor;
        await executor.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
        const stored = await executor.execute(sql`SELECT value FROM game_settings WHERE key=${LONELLE_KEY(userId)} FOR UPDATE`);
        const progress = parseLonelleProgress(stored.rows[0]?.value);
        if (progress?.status === "claimed") return { alreadyClaimed: true, coinsGranted: 0, reward: null };
        if (progress?.status !== "taken" || !progress.scarfInventoryId || progress.kills < LONELLE_REQUIRED_KILLS) fail("Bring Lonelle's Scarf back first");
        const scarfId = progress.scarfInventoryId;
        const equipped = await executor.execute(sql`
          SELECT ec.id FROM pet_equipped_costumes ec
          JOIN user_inventory pet ON pet.id=ec.pet_inventory_id AND pet.user_id=${userId}
          JOIN user_inventory scarf ON scarf.id=ec.costume_inventory_id AND scarf.user_id=${userId}
          WHERE ec.costume_inventory_id=${scarfId} AND ec.slot=3 FOR UPDATE OF ec
        `);
        if (!equipped.rows[0]) fail("Equip the scarf in the third adornment space before returning it");
        const reward = await catalog(executor, ["firefly cluster"]);
        if (!reward) fail("Firefly Cluster is not configured yet");
        await executor.execute(sql`DELETE FROM pet_equipped_costumes WHERE costume_inventory_id=${scarfId}`);
        const removed = await executor.execute(sql`DELETE FROM user_inventory WHERE id=${scarfId} AND user_id=${userId} AND quantity=1 RETURNING id`);
        if (!removed.rows[0]) fail("The quest scarf is missing");
        await executor.execute(sql`INSERT INTO user_inventory(user_id,shop_item_id,quantity) VALUES (${userId},${reward.id},1)`);
        const coins = await executor.execute(sql`
          UPDATE users SET coins=coins+${LONELLE_REWARD_COINS}, total_coins_earned=total_coins_earned+${LONELLE_REWARD_COINS}
          WHERE id=${userId} RETURNING coins
        `);
        await executor.execute(sql`
          UPDATE game_settings SET value=${JSON.stringify({ ...progress, status: "claimed" })} WHERE key=${LONELLE_KEY(userId)}
        `);
        return { alreadyClaimed: false, coinsGranted: LONELLE_REWARD_COINS, newCoinBalance: Number(coins.rows[0].coins), reward: { name: reward.name, imageUrl: reward.image_url } };
      });
      return res.json({ ok: true, ...claimed });
    } catch (error) { return errorResponse(res, error, "claim"); }
  });
}
