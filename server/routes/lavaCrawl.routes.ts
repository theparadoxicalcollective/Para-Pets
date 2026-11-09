import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { awardPlayerXpInTransaction } from "../playerProgressionStorage";
import { PLAYER_XP_REWARDS } from "@shared/playerProgression";
import { playerXpDayKey } from "../playerXpDayKey";

export interface LavaCrawlRouteDependencies {
  storage: typeof import("../storage").storage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
  /** Kept as an optional legacy registration dependency; never used to award pet XP. */
  applyPetXp?: (
    currentLevel: number, currentPoints: number, pointsToAdd: number,
  ) => { newLevel: number; newPoints: number };
}

/** Lava Crawl uses the player's avatar. A small player XP reward is limited to
 * one new personal best per Central calendar day, not per client-reported kill. */
export function registerLavaCrawlRoutes(
  app: Express,
  { db, isAuthenticated }: LavaCrawlRouteDependencies,
): void {
  app.post("/api/lava-crawl/complete", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string; username: string };
      const { score, coinsCollected } = req.body ?? {};
      if (typeof score !== "number" || !Number.isFinite(score) ||
          typeof coinsCollected !== "number" || !Number.isFinite(coinsCollected)) {
        return res.status(400).json({ message: "Valid score and coinsCollected required" });
      }
      const safeScore = Math.max(0, Math.min(999999, Math.floor(score)));
      const safeCoins = Math.max(0, Math.min(500, Math.floor(coinsCollected)));
      const completed = await db.transaction(async tx => {
        // Serialize scores and coin grants for an account. Compare against the
        // PREVIOUS maximum; checking after insert marks every tied run as a best.
        const locked = await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
        if (!locked.rows.length) throw new Error("User not found");
        const prior = await tx.execute(sql`SELECT MAX(score) AS best FROM lava_crawl_scores WHERE user_id = ${user.id}`);
        const priorBest = Number((prior.rows[0] as any)?.best ?? 0);
        const isNewBest = safeScore > priorBest && safeScore > 0;
        await tx.execute(sql`
          INSERT INTO lava_crawl_scores (user_id, username, score, coins_collected)
          VALUES (${user.id}, ${user.username}, ${safeScore}, ${safeCoins})
        `);
        let newCoins: number | undefined;
        if (safeCoins > 0) {
          const updated = await tx.execute(sql`
            UPDATE users SET coins = coins + ${safeCoins},
              total_coins_earned = total_coins_earned + ${safeCoins}
            WHERE id = ${user.id} RETURNING coins
          `);
          newCoins = Number((updated.rows[0] as any)?.coins);
        }
        let playerXpGranted = 0;
        if (isNewBest) {
          const award = await awardPlayerXpInTransaction(tx, user.id, {
            source: "minigame_best", eventId: `lava:${playerXpDayKey()}`,
            amount: PLAYER_XP_REWARDS.minigameBest,
          });
          if (award.status === "applied") playerXpGranted = PLAYER_XP_REWARDS.minigameBest;
        }
        return { isNewBest, newCoins, playerXpGranted };
      });
      return res.json({ ok: true, ...completed });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Deprecated deliberately: the old endpoint accepted arbitrary kill calls
  // and raised the ACTIVE PET's XP without verifying an actual game event.
  // Preserve its URL for older clients, but no longer grant pet XP.
  app.post("/api/lava-crawl/gain-exp", isAuthenticated, (_req, res) => {
    return res.status(410).json({ message: "Lava Crawl now awards player XP for personal bests" });
  });

  app.get("/api/lava-crawl/my-best", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string };
      const row = await db.execute(sql`
        SELECT MAX(score) AS best, MAX(coins_collected) AS best_coins
        FROM lava_crawl_scores WHERE user_id = ${user.id}
      `);
      const r = (row.rows[0] as any) ?? {};
      return res.json({ best: r.best ?? 0, bestCoins: r.best_coins ?? 0 });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/lava-crawl/leaderboard", isAuthenticated, async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT u.id AS user_id, u.username, u.profile_image,
          MAX(s.score) AS best_score, MAX(s.coins_collected) AS best_coins
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
