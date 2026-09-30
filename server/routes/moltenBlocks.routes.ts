import type { Express, RequestHandler } from "express";

export interface MoltenBlocksRouteDependencies {
  storage: typeof import("../storage").storage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
}

/**
 * Molten Blocks routes extracted from the legacy route registry without
 * changing endpoint URLs, reward caps, cooldowns, score handling, drop pools,
 * leaderboard responses, inventory awards, or admin permissions.
 */
export function registerMoltenBlocksRoutes(
  app: Express,
  { storage, isAuthenticated, isAdmin }: MoltenBlocksRouteDependencies,
): void {
  // ── Molten Blocks mini-game reward ────────────────────────────────────
  // Players earn 10 coins per 100 points scored in the volcanic-world Tetris
  // game (Molten Blocks). The client tallies how many coins were earned
  // during a single run and submits the total when the run ends.
  //
  // Anti-abuse (defense in depth — these don't need a DB migration):
  //   1. Per-call cap: 300 coins (a strong 3000-point run = 300 tier coins;
  //      plus multi-row bonuses, this leaves room for legitimate sessions).
  //   2. Per-user cooldown: must wait MIN_COOLDOWN_MS between submissions
  //      (a real game can't end faster than a few seconds).
  //   3. Per-user daily cap: at most DAILY_CAP coins from this game per
  //      UTC day. Prevents farming via repeated refresh-and-submit.
  // Caps are tracked in-memory; on a server restart the daily counter
  // resets, but the cap itself is small enough that the worst case is
  // bounded to ~one extra cap window per restart.
  const moltenRewardState = new Map<string, { dayKey: string; total: number; lastAt: number }>();
  const MB_PER_CALL_CAP = 300;
  const MB_DAILY_CAP = 500;
  const MB_MIN_COOLDOWN_MS = 4_000;

  app.post("/api/games/molten-blocks/reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const raw = Number((req.body ?? {}).coins);
      if (!Number.isFinite(raw) || raw <= 0) {
        const u = await storage.getUser(user.id);
        return res.json({ awarded: 0, coins: u?.coins ?? 0 });
      }

      const now = Date.now();
      const dayKey = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD UTC
      const entry = moltenRewardState.get(user.id);
      const fresh = !entry || entry.dayKey !== dayKey
        ? { dayKey, total: 0, lastAt: 0 }
        : entry;

      if (now - fresh.lastAt < MB_MIN_COOLDOWN_MS) {
        const u = await storage.getUser(user.id);
        return res.status(429).json({
          awarded: 0,
          coins: u?.coins ?? 0,
          message: "Please slow down — try again in a few seconds.",
        });
      }

      // Apply per-call cap, then clamp by remaining daily allowance.
      const callAmount = Math.min(MB_PER_CALL_CAP, Math.floor(raw));
      const dailyRemaining = Math.max(0, MB_DAILY_CAP - fresh.total);
      const amount = Math.min(callAmount, dailyRemaining);

      if (amount <= 0) {
        moltenRewardState.set(user.id, { ...fresh, lastAt: now });
        const u = await storage.getUser(user.id);
        return res.json({
          awarded: 0,
          coins: u?.coins ?? 0,
          dailyCapReached: true,
          message: "Daily Molten Blocks coin cap reached. Resets tomorrow!",
        });
      }

      const updated = await storage.addCoins(user.id, amount);
      moltenRewardState.set(user.id, { dayKey, total: fresh.total + amount, lastAt: now });
      return res.json({ awarded: amount, coins: updated.coins });
    } catch (err) {
      console.error("Molten Blocks reward error:", err);
      return res.status(500).json({ message: "Failed to grant reward" });
    }
  });

  app.get("/api/games/molten-blocks/leaderboard", async (req, res) => {
    try {
      const viewerId = (req.user as any)?.id;
      const top20 = await storage.getMoltenBlocksLeaderboard(viewerId);
      let viewerRank: { rank: number; score: number } | null = null;
      if (viewerId && !top20.some(e => e.isViewer)) {
        viewerRank = await storage.getMoltenBlocksViewerRank(viewerId);
      }
      return res.json({ top20, viewerRank });
    } catch (err) {
      console.error("Molten Blocks leaderboard error:", err);
      return res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.post("/api/games/molten-blocks/score", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const score = Number((req.body ?? {}).score);
      if (!Number.isFinite(score) || score < 0) {
        return res.status(400).json({ message: "Invalid score" });
      }
      const highScore = await storage.submitMoltenBlocksScore(user.id, Math.floor(score));
      return res.json({ highScore });
    } catch (err) {
      console.error("Molten Blocks score error:", err);
      return res.status(500).json({ message: "Failed to submit score" });
    }
  });

  app.get("/api/admin/molten-blocks/items", isAdmin, async (req, res) => {
    try {
      return res.json(await storage.getMoltenBlocksDropItems());
    } catch (err) {
      console.error("Admin molten blocks items error:", err);
      return res.status(500).json({ message: "Failed to fetch items" });
    }
  });

  app.post("/api/admin/molten-blocks/items", isAdmin, async (req, res) => {
    try {
      const { shopItemId, rarity } = req.body;
      if (!shopItemId || !["common","uncommon","rare"].includes(rarity)) {
        return res.status(400).json({ message: "shopItemId and rarity (common|uncommon|rare) required" });
      }
      await storage.addMoltenBlocksDropItem(shopItemId, rarity);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Admin add molten blocks item error:", err);
      return res.status(500).json({ message: "Failed to add item" });
    }
  });

  app.delete("/api/admin/molten-blocks/items/:id", isAdmin, async (req, res) => {
    try {
      await storage.removeMoltenBlocksDropItem(String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      console.error("Admin remove molten blocks item error:", err);
      return res.status(500).json({ message: "Failed to remove item" });
    }
  });

  app.patch("/api/admin/molten-blocks/items/:id", isAdmin, async (req, res) => {
    try {
      const { active } = req.body;
      if (typeof active !== "boolean") return res.status(400).json({ message: "active (boolean) required" });
      await storage.toggleMoltenBlocksDropItem(String(req.params.id), active);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Admin toggle molten blocks item error:", err);
      return res.status(500).json({ message: "Failed to toggle item" });
    }
  });

  app.get("/api/games/molten-blocks/drop-items", async (req, res) => {
    try {
      return res.json(await storage.getMoltenBlocksDropItems(true));
    } catch (err) {
      console.error("Molten blocks drop items error:", err);
      return res.status(500).json({ message: "Failed to fetch drop items" });
    }
  });

  app.post("/api/games/molten-blocks/award-item", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const dropItems = await storage.getMoltenBlocksDropItems(true);
      if (!dropItems.some(i => i.shopItemId === shopItemId)) {
        return res.status(400).json({ message: "Item not in active drop pool" });
      }
      await storage.addToInventory(user.id, shopItemId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Molten blocks award item error:", err);
      return res.status(500).json({ message: "Failed to award item" });
    }
  });


}
