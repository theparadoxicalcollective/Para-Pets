import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { userInventory } from "@shared/schema";

export interface LavaCrawlRouteDependencies {
  storage: typeof import("../storage").storage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
  applyPetXp: (
    currentLevel: number,
    currentPoints: number,
    pointsToAdd: number,
  ) => { newLevel: number; newPoints: number };
}

/**
 * Lava Crawl routes extracted from the legacy route registry without changing
 * score limits, coin rewards, XP scaling, leaderboard behavior, auth, or
 * response shapes.
 */
export function registerLavaCrawlRoutes(
  app: Express,
  { storage, db, isAuthenticated, applyPetXp }: LavaCrawlRouteDependencies,
): void {
  // ── Lava Crawl mini-game ────────────────────────────────────────────────────

  // Submit a completed run (save score + award coins to balance)
  app.post("/api/lava-crawl/complete", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { score, coinsCollected } = req.body;
      if (typeof score !== "number" || typeof coinsCollected !== "number") {
        return res.status(400).json({ message: "score and coinsCollected required" });
      }
      const safeScore = Math.max(0, Math.min(999999, Math.floor(score)));
      const safeCoins = Math.max(0, Math.min(500, Math.floor(coinsCollected)));

      // Save score record
      await db.execute(sql`
        INSERT INTO lava_crawl_scores (user_id, username, score, coins_collected)
        VALUES (${user.id}, ${user.username}, ${safeScore}, ${safeCoins})
      `);

      // Check if this is a new personal best
      const bestRow = await db.execute(sql`
        SELECT MAX(score) AS best FROM lava_crawl_scores WHERE user_id = ${user.id}
      `);
      const prevBest = (bestRow.rows[0] as any)?.best ?? 0;
      const isNewBest = safeScore >= prevBest;

      // Award real coins to player balance
      let updatedUser = null;
      if (safeCoins > 0) {
        updatedUser = await storage.addCoins(user.id, safeCoins);
      }
      return res.json({ ok: true, isNewBest, newCoins: updatedUser?.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Award EXP to active pet for each enemy killed in Lava Crawl
  app.post("/api/lava-crawl/gain-exp", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      let petResult: { petLevel: number; petLevelPoints: number; leveledUp: boolean; xpGranted: number } | null = null;
      if (user.activePetId) {
        const [petInv] = await db
          .select()
          .from(userInventory)
          .where(and(eq(userInventory.id, user.activePetId), eq(userInventory.userId, user.id)))
          .limit(1);
        if (petInv) {
          const prevLevel = petInv.petLevel || 1;
          // Scale XP per kill by pet level: +10% per level so high-level pets
          // aren't stuck grinding thousands of kills for one level-up.
          const EXP_PER_KILL = Math.floor(8 * (1 + (prevLevel - 1) * 0.1));
          const { newLevel, newPoints } = applyPetXp(prevLevel, petInv.petLevelPoints || 0, EXP_PER_KILL);
          const updates: any = { petLevelPoints: newPoints };
          if (newLevel > prevLevel) updates.petLevel = newLevel;
          const updated = await storage.updateInventoryItem(petInv.id, updates);
          petResult = {
            petLevel: updated.petLevel || 1,
            petLevelPoints: updated.petLevelPoints || 0,
            leveledUp: newLevel > prevLevel,
            xpGranted: EXP_PER_KILL,
          };
        }
      }
      return res.json({ ok: true, petResult });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Player's personal best score
  app.get("/api/lava-crawl/my-best", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const row = await db.execute(sql`
        SELECT MAX(score) AS best, MAX(coins_collected) AS best_coins
        FROM lava_crawl_scores
        WHERE user_id = ${user.id}
      `);
      const r = (row.rows[0] as any) ?? {};
      return res.json({ best: r.best ?? 0, bestCoins: r.best_coins ?? 0 });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Global leaderboard — best score per player, top 10
  app.get("/api/lava-crawl/leaderboard", isAuthenticated, async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT u.id AS user_id, u.username, u.profile_image, MAX(s.score) AS best_score, MAX(s.coins_collected) AS best_coins
        FROM lava_crawl_scores s
        JOIN users u ON s.user_id = u.id
        GROUP BY u.id, u.username, u.profile_image
        ORDER BY best_score DESC
        LIMIT 10
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });


}
