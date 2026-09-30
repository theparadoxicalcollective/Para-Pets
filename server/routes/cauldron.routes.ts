import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import type { IStorage } from "../storage";

export interface CauldronRouteDependencies {
  db: typeof database;
  storage: IStorage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
}

/**
 * Mixing Tree / Cauldron routes extracted from the legacy route registry.
 * Endpoint URLs, auth rules, response shapes, costs, capacity, and inventory
 * behavior intentionally remain unchanged in this architecture-only move.
 */
export function registerCauldronRoutes(
  app: Express,
  { db, storage, isAuthenticated, isAdmin }: CauldronRouteDependencies,
): void {
  // ── Mixing Tree cauldron ────────────────────────────────────────────────
  // Layout (admin-controlled position+size, shared by everyone) is stored in
  // game_settings as a single JSON blob. Per-user cauldron contents (the
  // ingredients a player has dropped in) live in their own per-user setting
  // key so we don't need a new table.
  const CAULDRON_LAYOUT_KEY = "mixing_tree_cauldron_layout";
  const cauldronContentsKey = (userId: string) => `cauldron_contents:${userId}`;
  const DEFAULT_CAULDRON_LAYOUT = { x: 50, y: 8, size: 38 }; // % of bg, size = width %
  
  app.get("/api/cauldron/layout", async (_req, res) => {
    try {
      const raw = await storage.getGameSetting(CAULDRON_LAYOUT_KEY);
      if (!raw) return res.json(DEFAULT_CAULDRON_LAYOUT);
      try {
        const parsed = JSON.parse(raw);
        return res.json({
          x: typeof parsed.x === "number" ? parsed.x : DEFAULT_CAULDRON_LAYOUT.x,
          y: typeof parsed.y === "number" ? parsed.y : DEFAULT_CAULDRON_LAYOUT.y,
          size: typeof parsed.size === "number" ? parsed.size : DEFAULT_CAULDRON_LAYOUT.size,
        });
      } catch {
        return res.json(DEFAULT_CAULDRON_LAYOUT);
      }
    } catch (err) {
      console.error("Get cauldron layout error:", err);
      return res.status(500).json({ message: "Failed to load cauldron layout" });
    }
  });
  
  app.patch("/api/admin/cauldron/layout", isAdmin, async (req, res) => {
    try {
      const { x, y, size } = req.body || {};
      if (typeof x !== "number" || typeof y !== "number" || typeof size !== "number") {
        return res.status(400).json({ message: "x, y, size required as numbers" });
      }
      const layout = {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        size: Math.max(10, Math.min(90, size)),
      };
      await storage.setGameSetting(CAULDRON_LAYOUT_KEY, JSON.stringify(layout));
      return res.json(layout);
    } catch (err) {
      console.error("Set cauldron layout error:", err);
      return res.status(500).json({ message: "Failed to update cauldron layout" });
    }
  });
  
  app.get("/api/cauldron/contents", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const raw = await storage.getGameSetting(cauldronContentsKey(user.id));
      const contents: Array<{ shopItemId: string; quantity: number }> =
        raw ? (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })() : [];
      // Hydrate with current item details (name + image) for the panel.
      const hydrated = await Promise.all(
        contents.map(async (c) => {
          const item = await storage.getShopItem(c.shopItemId);
          if (!item) return null;
          return {
            shopItemId: c.shopItemId,
            quantity: c.quantity,
            name: item.name,
            imageUrl: item.imageUrl,
          };
        })
      );
      return res.json(hydrated.filter(Boolean));
    } catch (err) {
      console.error("Get cauldron contents error:", err);
      return res.status(500).json({ message: "Failed to load cauldron contents" });
    }
  });
  
  app.post("/api/cauldron/contents", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.body || {};
      if (!inventoryId || typeof inventoryId !== "string") {
        return res.status(400).json({ message: "inventoryId is required" });
      }
      // Verify the inventory row belongs to this user and is an ingredient
      // BEFORE we attempt the atomic consume — this lets us return a clean
      // 400/404 instead of silently no-op'ing on bad input.
      const inv = await storage.getInventoryItemById(inventoryId);
      if (!inv || inv.userId !== user.id) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      const shopItem = await storage.getShopItem(inv.shopItemId);
      if (!shopItem || shopItem.type !== "ingredient") {
        return res.status(400).json({ message: "Only ingredients can be added to the cauldron" });
      }
      // Capacity check — the cauldron only holds two ingredients per brew so
      // the upcoming "mix" mechanic always operates on a clean pair. Enforce
      // server-side too so a tampered client can't bypass the UI cap.
      const CAULDRON_CAPACITY = 2;
      const existingRaw = await storage.getGameSetting(cauldronContentsKey(user.id));
      let existingContents: Array<{ shopItemId: string; quantity: number }> = [];
      if (existingRaw) {
        try { const p = JSON.parse(existingRaw); if (Array.isArray(p)) existingContents = p; } catch {}
      }
      const existingTotal = existingContents.reduce((n, c) => n + (c.quantity || 0), 0);
      if (existingTotal >= CAULDRON_CAPACITY) {
        return res.status(409).json({ message: "Cauldron is full" });
      }
      // Atomically take one unit from the player's inventory. We MUST only
      // credit the cauldron if `consumed === true`, otherwise concurrent
      // requests on the same inventory row could over-credit (the old
      // decrementInventoryQuantity conflated "consumed last unit" with
      // "nothing happened" via its `depleted` flag).
      const { consumed } = await storage.tryConsumeOneFromInventory(inventoryId, user.id);
      if (!consumed) {
        return res.status(409).json({ message: "Out of stock" });
      }
      // Append/merge into per-user contents JSON, reusing the read we did
      // for the capacity check above. (Per-user key means there is no
      // cross-user write contention, and a single user spamming taps is
      // naturally serialised by the inventory consume above — they can't
      // get past the consume step without a real unit being decremented.)
      const existing = existingContents.find((c) => c.shopItemId === inv.shopItemId);
      if (existing) existing.quantity += 1;
      else existingContents.push({ shopItemId: inv.shopItemId, quantity: 1 });
      await storage.setGameSetting(cauldronContentsKey(user.id), JSON.stringify(existingContents));
      return res.json({ ok: true });
    } catch (err) {
      console.error("Add to cauldron error:", err);
      return res.status(500).json({ message: "Failed to add to cauldron" });
    }
  });
  
  app.delete("/api/cauldron/contents", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      // Return any items in the cauldron back to the player's inventory
      const raw = await storage.getGameSetting(cauldronContentsKey(user.id));
      if (raw) {
        let contents: Array<{ shopItemId: string; quantity: number }> = [];
        try { const p = JSON.parse(raw); if (Array.isArray(p)) contents = p; } catch {}
        for (const c of contents) {
          if (!c.shopItemId || !c.quantity) continue;
          const existing = await db.execute(sql`
            SELECT id FROM user_inventory WHERE user_id = ${user.id} AND shop_item_id = ${c.shopItemId} LIMIT 1
          `);
          if (existing.rows.length) {
            await db.execute(sql`
              UPDATE user_inventory SET quantity = quantity + ${c.quantity} WHERE id = ${(existing.rows[0] as any).id}
            `);
          } else {
            await db.execute(sql`
              INSERT INTO user_inventory (user_id, shop_item_id, quantity) VALUES (${user.id}, ${c.shopItemId}, ${c.quantity})
            `);
          }
        }
      }
      await storage.setGameSetting(cauldronContentsKey(user.id), JSON.stringify([]));
      return res.json({ ok: true });
    } catch (err) {
      console.error("Clear cauldron error:", err);
      return res.status(500).json({ message: "Failed to clear cauldron" });
    }
  });
  
  // ── Brew: check recipe unlocked, award result, clear cauldron ───────────
  app.post("/api/cauldron/brew", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      // 1. Load cauldron contents
      const raw = await storage.getGameSetting(cauldronContentsKey(userId));
      let contents: Array<{ shopItemId: string; quantity: number }> = [];
      if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) contents = p; } catch {} }
  
      const flatIds: string[] = [];
      for (const c of contents) for (let i = 0; i < (c.quantity || 0); i++) flatIds.push(c.shopItemId);
      if (flatIds.length !== 2) {
        return res.status(400).json({ message: "Add exactly 2 ingredients to brew" });
      }
      const [id1, id2] = flatIds;
  
      // 2. Find a matching recipe (ingredient order doesn't matter)
      const recipeRows = await db.execute(sql`
        SELECT r.id, r.result_id, r.result_type,
               ri.name AS result_name, ri.image_url AS result_image
        FROM mixing_tree_recipes r
        JOIN shop_items ri ON r.result_id = ri.id
        WHERE (r.ingredient1_id = ${id1} AND r.ingredient2_id = ${id2})
           OR (r.ingredient1_id = ${id2} AND r.ingredient2_id = ${id1})
        LIMIT 1
      `);
      if (!recipeRows.rows.length) {
        return res.status(404).json({ message: "Incorrect Recipe", errorCode: "INCORRECT_RECIPE" });
      }
      const recipe = recipeRows.rows[0] as any;
  
      // 3. Player must have unlocked this recipe first
      const unlockedRow = await db.execute(sql`
        SELECT 1 FROM player_unlocked_recipes
        WHERE user_id = ${userId} AND recipe_id = ${recipe.id}
      `);
      if (!unlockedRow.rows.length) {
        return res.status(403).json({ message: "Find Recipe", errorCode: "RECIPE_LOCKED" });
      }
  
      // 4. Charge the brew fee
      const BREW_COST = 100;
      const brewer = await storage.getUser(userId);
      if (!brewer || (brewer.coins ?? 0) < BREW_COST) {
        return res.status(402).json({ message: "Not enough coins to brew (costs 100 coins)", errorCode: "INSUFFICIENT_COINS" });
      }
      await storage.addCoins(userId, -BREW_COST);
  
      // 5. Award the result item to the player
      const existing = await db.execute(sql`
        SELECT id FROM user_inventory
        WHERE user_id = ${userId} AND shop_item_id = ${recipe.result_id}
        LIMIT 1
      `);
      if (existing.rows.length) {
        await db.execute(sql`
          UPDATE user_inventory SET quantity = quantity + 1
          WHERE id = ${(existing.rows[0] as any).id}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO user_inventory (user_id, shop_item_id, quantity)
          VALUES (${userId}, ${recipe.result_id}, 1)
        `);
      }
  
      // 5. Clear the cauldron
      await storage.setGameSetting(cauldronContentsKey(userId), JSON.stringify([]));
  
      return res.json({
        ok: true,
        result: { name: recipe.result_name, imageUrl: recipe.result_image, type: recipe.result_type },
      });
    } catch (err) {
      console.error("Brew error:", err);
      return res.status(500).json({ message: "Failed to brew" });
    }
  });
  
  
}
