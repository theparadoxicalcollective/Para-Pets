import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { LONELLE_KEY, parseLonelleProgress } from "../lonelleQuest";

type InventoryManagementStorage = Pick<
  typeof import("../storage").storage,
  | "getInventoryItemById"
  | "getShopItem"
  | "removeFromInventory"
  | "updateInventoryItem"
  | "addCoins"
  | "getUserInventory"
>;

export interface InventoryManagementRouteDependencies {
  storage: InventoryManagementStorage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
  containsBadWord: (text: string) => Promise<boolean>;
}

/**
 * Player-owned inventory management routes.
 *
 * This is an organization-only boundary. It preserves the existing sell
 * exclusions, active-pet/Lonelle protections, nickname moderation, response
 * shapes, and error behavior.
 */
export function registerInventoryManagementRoutes(
  app: Express,
  {
    storage,
    db,
    isAuthenticated,
    containsBadWord,
  }: InventoryManagementRouteDependencies,
): void {
  app.post("/api/shop/sell-items", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array required" });
      }
      const COINS_PER_ITEM = 2;
      let totalCoinsEarned = 0;
      for (const entry of items) {
        const { inventoryId, quantity = 1 } = entry;
        if (!inventoryId || typeof inventoryId !== "string") continue;
        const invItem = await storage.getInventoryItemById(inventoryId);
        if (!invItem || invItem.userId !== user.id) continue;
        const shopItem = invItem.shopItemId ? await storage.getShopItem(invItem.shopItemId) : null;
        if (shopItem?.type === "pet") continue;
        if (shopItem?.fishingType === "fish") continue;
        const currentQty = invItem.quantity ?? 1;
        const toSell = Math.min(Math.max(1, quantity), currentQty);
        if (toSell >= currentQty) {
          await storage.removeFromInventory(inventoryId);
        } else {
          await storage.updateInventoryItem(inventoryId, { quantity: currentQty - toSell });
        }
        totalCoinsEarned += COINS_PER_ITEM * toSell;
      }
      if (totalCoinsEarned === 0) {
        return res.status(400).json({ message: "No valid items to sell" });
      }
      const updated = await storage.addCoins(user.id, totalCoinsEarned);
      return res.json({ coinsEarned: totalCoinsEarned, newBalance: updated.coins });
    } catch (err) {
      console.error("Sell items error:", err);
      return res.status(500).json({ message: "Failed to sell items" });
    }
  });

  app.delete("/api/inventory/:inventoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const allInv = await storage.getUserInventory(user.id);
      const item = allInv.find((inv) => inv.id === inventoryId);
      if (!item) {
        return res.status(404).json({ message: "Item not found in your inventory" });
      }
      if (item.id === user.activePetId) {
        return res.status(400).json({ message: "Cannot delete your active pet" });
      }
      const quest = await db.execute(sql`SELECT value FROM game_settings WHERE key=${LONELLE_KEY(user.id)}`);
      if (parseLonelleProgress(quest.rows[0]?.value)?.scarfInventoryId === inventoryId) {
        return res.status(409).json({ message: "Return Lonelle's quest scarf before deleting it" });
      }
      await storage.removeFromInventory(inventoryId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete inventory item error:", err);
      return res.status(500).json({ message: "Failed to delete item" });
    }
  });

  app.patch("/api/inventory/:inventoryId/nickname", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const { nickname } = req.body;
      const trimmed = (nickname || "").trim().slice(0, 20);
      if (trimmed && await containsBadWord(trimmed)) {
        return res.status(400).json({ message: "That name contains a forbidden word. Please choose another." });
      }
      const item = await storage.getInventoryItemById(inventoryId);
      if (!item || item.userId !== user.id) {
        return res.status(404).json({ message: "Item not found" });
      }
      const updated = await storage.updateInventoryItem(inventoryId, { petNickname: trimmed || null });
      return res.json(updated);
    } catch (err) {
      console.error("Update nickname error:", err);
      return res.status(500).json({ message: "Failed to update nickname" });
    }
  });
}
