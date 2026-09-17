import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAdmin, requireAuthenticated } from "../auth";
import { storage } from "../storage";
import {
  DAILY_CLAIM_SETTING_KEY,
  dailyClaimConfigSchema,
  parseDailyClaimConfig,
  type DailyClaimConfig,
} from "../dailyClaimConfig";

const DAILY_PVP_TICKETS = 5;
const DAILY_RAID_TICKETS = 5;

const PVP_TICKET_ITEM_ID = "a1b2c3d4-9001-4000-8000-000000000099";
const RAID_TICKET_ITEM_ID = "a1b2c3d4-9002-4000-8000-000000000099";

const PVP_TICKET_CAP = 100;
const RAID_TICKET_CAP = 25;

interface PresentedRewardItem {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
}

async function readDailyClaimConfig(): Promise<DailyClaimConfig> {
  return parseDailyClaimConfig(await storage.getGameSetting(DAILY_CLAIM_SETTING_KEY));
}

function presentRewardItem(item: any): PresentedRewardItem {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    imageUrl: item.type === "pet"
      ? (item.eggImageUrl ?? item.imageUrl ?? null)
      : (item.imageUrl ?? null),
  };
}

async function getConfiguredRewardItems(itemIds: string[]): Promise<PresentedRewardItem[]> {
  const items = await Promise.all(itemIds.map((id) => storage.getShopItem(id)));
  return items.filter((item): item is NonNullable<typeof item> => !!item).map(presentRewardItem);
}

async function getTicketCount(tx: any, userId: string, shopItemId: string): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM user_inventory
    WHERE user_id = ${userId} AND shop_item_id = ${shopItemId}
  `);
  return Number((rows.rows[0] as any)?.total ?? 0);
}

async function grantTickets(
  tx: any,
  userId: string,
  shopItemId: string,
  requestedAmount: number,
  cap: number,
): Promise<number> {
  const current = await getTicketCount(tx, userId, shopItemId);
  const amountToGrant = Math.max(0, Math.min(requestedAmount, cap - current));
  if (amountToGrant <= 0) return 0;

  const updated = await tx.execute(sql`
    UPDATE user_inventory
    SET quantity = quantity + ${amountToGrant}
    WHERE id = (
      SELECT id FROM user_inventory
      WHERE user_id = ${userId} AND shop_item_id = ${shopItemId}
      ORDER BY id
      LIMIT 1
    )
    RETURNING id
  `);

  if (updated.rows.length === 0) {
    await tx.execute(sql`
      INSERT INTO user_inventory (user_id, shop_item_id, quantity)
      VALUES (${userId}, ${shopItemId}, ${amountToGrant})
    `);
  }

  return amountToGrant;
}

async function grantConfiguredItem(
  tx: any,
  userId: string,
  shopItemId: string,
): Promise<PresentedRewardItem | null> {
  const found = await tx.execute(sql`
    SELECT id, name, type, fishing_type, image_url, egg_image_url
    FROM shop_items
    WHERE id = ${shopItemId}
    LIMIT 1
  `);
  const item = found.rows[0] as any;
  if (!item) return null;

  const needsSeparateInventoryRow = item.type === "pet"
    || (item.type === "fishing" && item.fishing_type === "pole");

  if (needsSeparateInventoryRow) {
    await tx.execute(sql`
      INSERT INTO user_inventory (user_id, shop_item_id, quantity, hatch_started_at)
      VALUES (${userId}, ${shopItemId}, 1, ${item.type === "pet" ? new Date() : null})
    `);
  } else {
    const updated = await tx.execute(sql`
      UPDATE user_inventory
      SET quantity = COALESCE(quantity, 0) + 1
      WHERE id = (
        SELECT id FROM user_inventory
        WHERE user_id = ${userId} AND shop_item_id = ${shopItemId}
        ORDER BY id
        LIMIT 1
      )
      RETURNING id
    `);
    if (updated.rows.length === 0) {
      await tx.execute(sql`
        INSERT INTO user_inventory (user_id, shop_item_id, quantity)
        VALUES (${userId}, ${shopItemId}, 1)
      `);
    }
  }

  return {
    id: item.id,
    name: item.name,
    type: item.type,
    imageUrl: item.type === "pet"
      ? (item.egg_image_url ?? item.image_url ?? null)
      : (item.image_url ?? null),
  };
}

export function registerDailyClaimRoutes(app: Express): void {
  app.get("/api/daily-claim/config", async (_req, res) => {
    try {
      const config = await readDailyClaimConfig();
      return res.json({
        ...config,
        items: await getConfiguredRewardItems(config.itemIds),
        pvpTickets: DAILY_PVP_TICKETS,
        raidTickets: DAILY_RAID_TICKETS,
      });
    } catch (err) {
      console.error("Daily claim config error:", err);
      return res.status(500).json({ message: "Failed to get daily reward configuration" });
    }
  });

  app.put("/api/admin/daily-claim/config", requireAdmin, async (req, res) => {
    try {
      const parsed = dailyClaimConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Invalid daily reward configuration",
        });
      }

      const items = await Promise.all(parsed.data.itemIds.map((id) => storage.getShopItem(id)));
      if (items.some((item) => !item)) {
        return res.status(400).json({ message: "One or more selected reward items no longer exist" });
      }

      await storage.setGameSetting(DAILY_CLAIM_SETTING_KEY, JSON.stringify(parsed.data));
      return res.json({
        ...parsed.data,
        items: items.map((item) => presentRewardItem(item!)),
        pvpTickets: DAILY_PVP_TICKETS,
        raidTickets: DAILY_RAID_TICKETS,
      });
    } catch (err) {
      console.error("Update daily claim config error:", err);
      return res.status(500).json({ message: "Failed to update daily reward configuration" });
    }
  });

  app.get("/api/daily-claim/status", requireAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await db.execute(sql`
        SELECT
          MAX(claimed_at) AS last_claimed,
          (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim,
          CASE WHEN MAX(claimed_at) IS NOT NULL
            THEN MAX(claimed_at) + INTERVAL '24 hours'
            ELSE NULL
          END AS next_claim_at
        FROM player_daily_login_claims
        WHERE user_id = ${user.id}
      `);

      return res.json({
        canClaim: !!result.rows[0].can_claim,
        lastClaimedAt: result.rows[0].last_claimed,
        nextClaimAt: result.rows[0].next_claim_at,
      });
    } catch (err) {
      console.error("Daily claim status error:", err);
      return res.status(500).json({ message: "Failed to get daily claim status" });
    }
  });

  app.post("/api/daily-claim", requireAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const config = await readDailyClaimConfig();
      const result = await db.transaction(async (tx) => {
        // Serialize daily claims for this player so double taps cannot double-credit.
        await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);

        const check = await tx.execute(sql`
          SELECT (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim
          FROM player_daily_login_claims
          WHERE user_id = ${user.id}
        `);
        if (!check.rows[0].can_claim) return { ok: false as const };

        await tx.execute(sql`
          UPDATE users
          SET coins = coins + ${config.coinAmount},
              essence = COALESCE(essence, 0) + ${config.essenceAmount},
              total_coins_earned = total_coins_earned + ${config.coinAmount}
          WHERE id = ${user.id}
        `);

        const grantedItems: PresentedRewardItem[] = [];
        for (const itemId of config.itemIds) {
          const granted = await grantConfiguredItem(tx, user.id, itemId);
          if (granted) grantedItems.push(granted);
        }

        // Tickets keep their existing caps even when the configurable rewards change.
        const pvpTicketsGranted = await grantTickets(
          tx,
          user.id,
          PVP_TICKET_ITEM_ID,
          DAILY_PVP_TICKETS,
          PVP_TICKET_CAP,
        );
        const raidTicketsGranted = await grantTickets(
          tx,
          user.id,
          RAID_TICKET_ITEM_ID,
          DAILY_RAID_TICKETS,
          RAID_TICKET_CAP,
        );

        const inserted = await tx.execute(sql`
          INSERT INTO player_daily_login_claims (user_id, cycle_number, day_number)
          VALUES (${user.id}, 0, 1)
          RETURNING claimed_at, claimed_at + INTERVAL '24 hours' AS next_claim_at
        `);

        return {
          ok: true as const,
          claimedAt: inserted.rows[0].claimed_at,
          nextClaimAt: inserted.rows[0].next_claim_at,
          pvpTicketsGranted,
          raidTicketsGranted,
          grantedItems,
        };
      });

      if (!result.ok) {
        return res.status(400).json({ message: "Already claimed. Come back in 24 hours!" });
      }

      return res.json({
        coinAmount: config.coinAmount,
        essenceAmount: config.essenceAmount,
        items: result.grantedItems,
        pvpTickets: result.pvpTicketsGranted,
        raidTickets: result.raidTicketsGranted,
        canClaim: false,
        lastClaimedAt: result.claimedAt,
        nextClaimAt: result.nextClaimAt,
      });
    } catch (err) {
      console.error("Daily claim error:", err);
      return res.status(500).json({ message: "Failed to claim daily reward" });
    }
  });
}
