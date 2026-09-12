import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAdmin, requireAuthenticated } from "../auth";
import { isValidRedeemCode, normalizeRedeemCode } from "../redeemCode";

type RedeemError = Error & { code?: string; status?: number };

function fail(message: string, code: string, status: number): never {
  throw Object.assign(new Error(message), { code, status });
}

export function registerRedeemCodeRoutes(app: Express): void {
  app.get("/api/admin/redeem-codes", requireAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT rc.id, rc.code, rc.active, rc.expires_at, rc.created_at,
               rb.name AS bundle_name, rb.message, rb.coin_amount,
               COUNT(DISTINCT rcr.user_id)::int AS redemption_count
        FROM redeem_codes rc
        JOIN reward_bundles rb ON rb.id = rc.bundle_id
        LEFT JOIN redeem_code_redemptions rcr ON rcr.code_id = rc.id
        GROUP BY rc.id, rb.id
        ORDER BY rc.created_at DESC
      `);
      return res.json(result.rows);
    } catch (error) {
      console.error("List redeem codes error:", error);
      return res.status(500).json({ message: "Failed to load redeem codes" });
    }
  });

  app.post("/api/admin/redeem-codes", requireAdmin, async (req, res) => {
    try {
      const code = normalizeRedeemCode(req.body?.code);
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const coinAmount = Math.max(0, Math.floor(Number(req.body?.coinAmount) || 0));
      const shopItemIds = Array.isArray(req.body?.shopItemIds)
        ? req.body.shopItemIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 999)
        : [];
      const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;

      if (!isValidRedeemCode(code)) return res.status(400).json({ message: "Code must be 3–32 letters, numbers, or hyphens" });
      if (!name) return res.status(400).json({ message: "Give this code reward a name" });
      if (!coinAmount && shopItemIds.length === 0) return res.status(400).json({ message: "Add coins or at least one item" });
      if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ message: "Expiration date is invalid" });

      const created = await db.transaction(async (tx) => {
        if (shopItemIds.length) {
          const uniqueItemIds = [...new Set(shopItemIds)];
          const found = await tx.execute(sql`SELECT id FROM shop_items WHERE id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})`);
          if (found.rows.length !== uniqueItemIds.length) fail("One or more reward items no longer exist", "INVALID_ITEM", 400);
        }

        const bundleResult = await tx.execute(sql`
          INSERT INTO reward_bundles (name, message, coin_amount)
          VALUES (${name}, ${message || null}, ${coinAmount})
          RETURNING id
        `);
        const bundleId = String(bundleResult.rows[0].id);
        for (const shopItemId of shopItemIds) {
          await tx.execute(sql`INSERT INTO reward_bundle_items (bundle_id, shop_item_id) VALUES (${bundleId}, ${shopItemId})`);
        }
        const codeResult = await tx.execute(sql`
          INSERT INTO redeem_codes (code, bundle_id, active, expires_at, created_by)
          VALUES (${code}, ${bundleId}, true, ${expiresAt}, ${(req.user as { id: string }).id})
          RETURNING id, code, active, expires_at, created_at
        `);
        return codeResult.rows[0];
      });

      return res.status(201).json(created);
    } catch (error) {
      const err = error as RedeemError & { constraint?: string };
      if (err.constraint === "redeem_codes_code_key" || (err as any).code === "23505") {
        return res.status(409).json({ message: "That redeem code already exists" });
      }
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      console.error("Create redeem code error:", error);
      return res.status(500).json({ message: "Failed to create redeem code" });
    }
  });

  app.patch("/api/admin/redeem-codes/:id", requireAdmin, async (req, res) => {
    try {
      if (typeof req.body?.active !== "boolean") return res.status(400).json({ message: "Active must be true or false" });
      const updated = await db.execute(sql`
        UPDATE redeem_codes SET active = ${req.body.active}
        WHERE id = ${req.params.id} RETURNING id, code, active, expires_at, created_at
      `);
      if (!updated.rows.length) return res.status(404).json({ message: "Redeem code not found" });
      return res.json(updated.rows[0]);
    } catch (error) {
      console.error("Update redeem code error:", error);
      return res.status(500).json({ message: "Failed to update redeem code" });
    }
  });

  app.post("/api/redeem-code", requireAuthenticated, async (req, res) => {
    try {
      const code = normalizeRedeemCode(req.body?.code);
      if (!isValidRedeemCode(code)) return res.status(400).json({ message: "Enter a valid redeem code", code: "INVALID_CODE" });
      const userId = (req.user as { id: string }).id;

      const reward = await db.transaction(async (tx) => {
        const userResult = await tx.execute(sql`SELECT email_verified FROM users WHERE id = ${userId} FOR UPDATE`);
        if (!userResult.rows[0]?.email_verified) fail("Please verify your email before redeeming a code", "EMAIL_UNVERIFIED", 403);

        const codeResult = await tx.execute(sql`
          SELECT id, bundle_id, active, expires_at
          FROM redeem_codes WHERE code = ${code} FOR UPDATE
        `);
        const redeemCode = codeResult.rows[0] as any;
        if (!redeemCode) fail("That code was not found", "CODE_NOT_FOUND", 404);
        if (!redeemCode.active) fail("That code is no longer active", "CODE_INACTIVE", 410);
        if (redeemCode.expires_at && new Date(redeemCode.expires_at) <= new Date()) fail("That code has expired", "CODE_EXPIRED", 410);

        const reserved = await tx.execute(sql`
          INSERT INTO redeem_code_redemptions (code_id, user_id)
          VALUES (${redeemCode.id}, ${userId})
          ON CONFLICT (code_id, user_id) DO NOTHING
          RETURNING id
        `);
        if (!reserved.rows.length) fail("You have already redeemed this code", "ALREADY_REDEEMED", 409);

        const delivered = await tx.execute(sql`
          INSERT INTO user_rewards (user_id, bundle_id)
          VALUES (${userId}, ${redeemCode.bundle_id})
          RETURNING id
        `);
        return { rewardId: delivered.rows[0].id, code };
      });

      return res.status(201).json({ ...reward, message: "Reward delivered to your Reward Box" });
    } catch (error) {
      const err = error as RedeemError;
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      console.error("Redeem code error:", error);
      return res.status(500).json({ message: "Unable to redeem code right now" });
    }
  });
}
