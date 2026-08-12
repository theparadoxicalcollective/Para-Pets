import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuthenticated } from "../auth";

const DAILY_REWARD_COINS = 100;
const DAILY_REWARD_ESSENCE = 100;
const DAILY_PVP_TICKETS = 5;
const DAILY_RAID_TICKETS = 5;

const PVP_TICKET_ITEM_ID = "a1b2c3d4-9001-4000-8000-000000000099";
const RAID_TICKET_ITEM_ID = "a1b2c3d4-9002-4000-8000-000000000099";

const PVP_TICKET_CAP = 100;
const RAID_TICKET_CAP = 25;

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

export function registerDailyClaimRoutes(app: Express): void {
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
      const result = await db.transaction(async (tx) => {
        // Serialize daily claims for this player so double taps cannot double-credit.
        await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);

        const check = await tx.execute(sql`
          SELECT (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim
          FROM player_daily_login_claims
          WHERE user_id = ${user.id}
        `);
        if (!check.rows[0].can_claim) return { ok: false as const };

        // Coins and essence are always granted on a valid daily claim.
        await tx.execute(sql`
          UPDATE users
          SET coins = coins + ${DAILY_REWARD_COINS},
              essence = COALESCE(essence, 0) + ${DAILY_REWARD_ESSENCE},
              total_coins_earned = total_coins_earned + ${DAILY_REWARD_COINS}
          WHERE id = ${user.id}
        `);

        // Tickets grant only the room available under each inventory cap.
        // Examples: 98 PvP -> +2, 100 PvP -> +0; 23 Raid -> +2, 25 Raid -> +0.
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
        };
      });

      if (!result.ok) {
        return res.status(400).json({ message: "Already claimed. Come back in 24 hours!" });
      }

      return res.json({
        coinAmount: DAILY_REWARD_COINS,
        essenceAmount: DAILY_REWARD_ESSENCE,
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
