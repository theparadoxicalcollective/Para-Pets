import type { Express, RequestHandler } from "express";
import type { db as database } from "../db";
import type { IStorage } from "../storage";
import {
  addCauldronIngredient,
  brewCauldron,
  cauldronContentsKey,
  clearCauldronContents,
} from "../cauldron/transactions";

export interface CauldronRouteDependencies {
  db: typeof database;
  storage: IStorage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
}

/**
 * Mixing Tree / Cauldron routes remain isolated from the legacy registry.
 * Value-moving mutations delegate to one transactional service so inventory,
 * coins, result awards, and Cauldron contents cannot partially commit.
 */
export function registerCauldronRoutes(
  app: Express,
  { db, storage, isAuthenticated, isAdmin }: CauldronRouteDependencies,
): void {
  // Layout (admin-controlled position+size, shared by everyone) is stored in
  // game_settings as a single JSON blob.
  const CAULDRON_LAYOUT_KEY = "mixing_tree_cauldron_layout";
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
        }),
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

      const result = await addCauldronIngredient(db, { userId: user.id, inventoryId });
      if (!result.ok) return res.status(result.status).json(result.body);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Add to cauldron error:", err);
      return res.status(500).json({ message: "Failed to add to cauldron" });
    }
  });

  app.delete("/api/cauldron/contents", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await clearCauldronContents(db, user.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Clear cauldron error:", err);
      return res.status(500).json({ message: "Failed to clear cauldron" });
    }
  });

  app.post("/api/cauldron/brew", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      const result = await brewCauldron(db, userId);
      if (!result.ok) return res.status(result.status).json(result.body);
      return res.json({ ok: true, result: result.result });
    } catch (err) {
      console.error("Brew error:", err);
      return res.status(500).json({ message: "Failed to brew" });
    }
  });
}
