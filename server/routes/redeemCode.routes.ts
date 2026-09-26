import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAdmin, requireAuthenticated } from "../auth";
import { isValidRedeemCode, normalizeRedeemCode, parseMaxRedemptions } from "../redeemCode";
import { parseBundleCards, type CardBundleEntry } from "../cards";

type RedeemError = Error & { code?: string; status?: number };

function fail(message: string, code: string, status: number): never {
  throw Object.assign(new Error(message), { code, status });
}

interface AdminCodePayload {
  code: string;
  name: string;
  message: string;
  coinAmount: number;
  shopItemIds: string[];
  cards: CardBundleEntry[];
  maxRedemptions: number;
}

function parseAdminCodePayload(body: any): AdminCodePayload {
  const code = normalizeRedeemCode(body?.code);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const coinAmount = Math.max(0, Math.floor(Number(body?.coinAmount) || 0));
  const shopItemIds = Array.isArray(body?.shopItemIds)
    ? body.shopItemIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 999)
    : [];
  let cards: CardBundleEntry[];
  try { cards = parseBundleCards(body?.cards); }
  catch (error: any) { fail(error.message, "INVALID_CARDS", 400); }
  const maxRedemptions = parseMaxRedemptions(body?.maxRedemptions);

  if (!isValidRedeemCode(code)) fail("Code must be 3–32 letters, numbers, or hyphens", "INVALID_CODE", 400);
  if (!name) fail("Give this code reward a name", "INVALID_NAME", 400);
  if (!coinAmount && shopItemIds.length === 0 && cards.length === 0) fail("Add coins, an item, or a card", "EMPTY_REWARD", 400);
  if (maxRedemptions === null) fail("Redemption limit must be a whole number from 1 to 1,000,000", "INVALID_LIMIT", 400);

  return { code, name, message, coinAmount, shopItemIds, cards, maxRedemptions };
}

async function validateBundleChoices(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], shopItemIds: string[], cards: CardBundleEntry[]) {
  if (shopItemIds.length) {
    const uniqueItemIds = [...new Set(shopItemIds)];
    const found = await tx.execute(sql`SELECT id FROM shop_items WHERE id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})`);
    if (found.rows.length !== uniqueItemIds.length) fail("One or more reward items no longer exist", "INVALID_ITEM", 400);
  }
  for (const card of cards) {
    const found = await tx.execute(sql`SELECT id FROM card_definitions WHERE id = ${card.cardId} FOR SHARE`);
    if (!found.rows.length) fail("One or more reward cards no longer exist", "INVALID_CARD", 400);
  }
}

export function registerRedeemCodeRoutes(app: Express): void {
  app.get("/api/admin/redeem-codes", requireAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT rc.id, rc.code, rc.active, rc.expires_at, rc.max_redemptions, rc.created_at,
               rb.name AS bundle_name, rb.message, rb.coin_amount,
               COUNT(DISTINCT rcr.user_id)::int AS redemption_count,
               COALESCE((
                 SELECT json_agg(rbi.shop_item_id ORDER BY rbi.id)
                 FROM reward_bundle_items rbi
                 WHERE rbi.bundle_id = rb.id
               ), '[]'::json) AS shop_item_ids,
               COALESCE((
                 SELECT json_agg(json_build_object('cardId', rbc.card_id, 'quantity', rbc.quantity) ORDER BY rbc.card_id)
                 FROM reward_bundle_cards rbc
                 WHERE rbc.bundle_id = rb.id
               ), '[]'::json) AS cards
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
      const payload = parseAdminCodePayload(req.body);
      const created = await db.transaction(async (tx) => {
        await validateBundleChoices(tx, payload.shopItemIds, payload.cards);

        const bundleResult = await tx.execute(sql`
          INSERT INTO reward_bundles (name, message, coin_amount)
          VALUES (${payload.name}, ${payload.message || null}, ${payload.coinAmount})
          RETURNING id
        `);
        const bundleId = String(bundleResult.rows[0].id);
        for (const shopItemId of payload.shopItemIds) {
          await tx.execute(sql`INSERT INTO reward_bundle_items (bundle_id, shop_item_id) VALUES (${bundleId}, ${shopItemId})`);
        }
        for (const card of payload.cards) {
          await tx.execute(sql`INSERT INTO reward_bundle_cards (bundle_id, card_id, quantity) VALUES (${bundleId}, ${card.cardId}, ${card.quantity})`);
        }
        const codeResult = await tx.execute(sql`
          INSERT INTO redeem_codes (code, bundle_id, active, max_redemptions, created_by)
          VALUES (${payload.code}, ${bundleId}, true, ${payload.maxRedemptions}, ${(req.user as { id: string }).id})
          RETURNING id, code, active, max_redemptions, created_at
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

  app.put("/api/admin/redeem-codes/:id", requireAdmin, async (req, res) => {
    try {
      const payload = parseAdminCodePayload(req.body);
      const updated = await db.transaction(async (tx) => {
        // Redemption also locks this row first, so edit-vs-redeem races serialize safely.
        const locked = await tx.execute(sql`
          SELECT id, bundle_id FROM redeem_codes
          WHERE id = ${req.params.id}
          FOR UPDATE
        `);
        if (!locked.rows.length) fail("Redeem code not found", "CODE_NOT_FOUND", 404);
        const bundleId = String(locked.rows[0].bundle_id);

        const redemptions = await tx.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM redeem_code_redemptions
          WHERE code_id = ${req.params.id}
        `);
        if (Number(redemptions.rows[0]?.total || 0) > 0) {
          fail("This code has already been redeemed and can no longer be edited", "CODE_ALREADY_REDEEMED", 409);
        }

        await validateBundleChoices(tx, payload.shopItemIds, payload.cards);

        await tx.execute(sql`
          UPDATE reward_bundles
          SET name = ${payload.name}, message = ${payload.message || null}, coin_amount = ${payload.coinAmount}
          WHERE id = ${bundleId}
        `);
        await tx.execute(sql`DELETE FROM reward_bundle_items WHERE bundle_id = ${bundleId}`);
        for (const shopItemId of payload.shopItemIds) {
          await tx.execute(sql`INSERT INTO reward_bundle_items (bundle_id, shop_item_id) VALUES (${bundleId}, ${shopItemId})`);
        }
        await tx.execute(sql`DELETE FROM reward_bundle_cards WHERE bundle_id = ${bundleId}`);
        for (const card of payload.cards) {
          await tx.execute(sql`INSERT INTO reward_bundle_cards (bundle_id, card_id, quantity) VALUES (${bundleId}, ${card.cardId}, ${card.quantity})`);
        }

        const codeResult = await tx.execute(sql`
          UPDATE redeem_codes
          SET code = ${payload.code}, max_redemptions = ${payload.maxRedemptions}
          WHERE id = ${req.params.id}
          RETURNING id, code, active, expires_at, max_redemptions, created_at
        `);
        return codeResult.rows[0];
      });
      return res.json(updated);
    } catch (error) {
      const err = error as RedeemError & { constraint?: string };
      if (err.constraint === "redeem_codes_code_key" || (err as any).code === "23505") {
        return res.status(409).json({ message: "That redeem code already exists" });
      }
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      console.error("Edit redeem code error:", error);
      return res.status(500).json({ message: "Failed to edit redeem code" });
    }
  });

  app.patch("/api/admin/redeem-codes/:id", requireAdmin, async (req, res) => {
    try {
      if (typeof req.body?.active !== "boolean") return res.status(400).json({ message: "Active must be true or false" });
      const updated = await db.execute(sql`
        UPDATE redeem_codes SET active = ${req.body.active}
        WHERE id = ${req.params.id} RETURNING id, code, active, expires_at, max_redemptions, created_at
      `);
      if (!updated.rows.length) return res.status(404).json({ message: "Redeem code not found" });
      return res.json(updated.rows[0]);
    } catch (error) {
      console.error("Update redeem code error:", error);
      return res.status(500).json({ message: "Failed to update redeem code" });
    }
  });

  app.delete("/api/admin/redeem-codes/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`
          SELECT id, bundle_id FROM redeem_codes
          WHERE id = ${req.params.id}
          FOR UPDATE
        `);
        if (!locked.rows.length) fail("Redeem code not found", "CODE_NOT_FOUND", 404);
        const bundleId = String(locked.rows[0].bundle_id);

        const count = await tx.execute(sql`
          SELECT COUNT(*)::int AS total FROM redeem_code_redemptions WHERE code_id = ${req.params.id}
        `);
        const redemptionCount = Number(count.rows[0]?.total || 0);

        await tx.execute(sql`DELETE FROM redeem_codes WHERE id = ${req.params.id}`);

        // A redeemed code may have pending/claimed user_rewards pointing at its bundle.
        // Clean the bundle only when doing so cannot break a delivered reward.
        await tx.execute(sql`
          DELETE FROM reward_bundles
          WHERE id = ${bundleId}
            AND NOT EXISTS (SELECT 1 FROM user_rewards WHERE bundle_id = ${bundleId})
        `);

        return { id: req.params.id, redemptionCount };
      });
      return res.json(deleted);
    } catch (error) {
      const err = error as RedeemError;
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      console.error("Delete redeem code error:", error);
      return res.status(500).json({ message: "Failed to delete redeem code" });
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
          SELECT id, bundle_id, active, expires_at, max_redemptions
          FROM redeem_codes WHERE code = ${code} FOR UPDATE
        `);
        const redeemCode = codeResult.rows[0] as any;
        if (!redeemCode) fail("That code was not found", "CODE_NOT_FOUND", 404);
        if (!redeemCode.active) fail("That code is no longer active", "CODE_INACTIVE", 410);
        if (redeemCode.expires_at && new Date(redeemCode.expires_at) <= new Date()) fail("That code has expired", "CODE_EXPIRED", 410);

        const previous = await tx.execute(sql`
          SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE user_id = ${userId})::int AS own
          FROM redeem_code_redemptions WHERE code_id = ${redeemCode.id}
        `);
        if (Number(previous.rows[0].own) > 0) fail("You have already redeemed this code", "ALREADY_REDEEMED", 409);
        if (redeemCode.max_redemptions !== null && Number(previous.rows[0].total) >= Number(redeemCode.max_redemptions))
          fail("This code has reached its redemption limit", "CODE_LIMIT_REACHED", 410);

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
