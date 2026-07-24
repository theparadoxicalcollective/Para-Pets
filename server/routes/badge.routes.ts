import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { executeBadgePeriodicClaim } from "../badgePeriodicClaim";
import type { db as database } from "../db";

type BadgeStorage = Pick<typeof import("../storage").storage,
  | "getAllBadges" | "getUserBadges" | "createBadge" | "deleteBadge"
  | "updateBadge" | "getBadgeLeaderboard" | "getDevotionLeaderboard"
  | "getBadgeRecipients" | "awardBadge" | "revokeBadge"
>;

type ProcessWorldImage = (imageData: string, maxDimension: number) => Promise<string>;

export interface BadgeRouteDependencies {
  storage: BadgeStorage;
  db: typeof database;
  isAuthenticated: RequestHandler;
  processWorldImage: ProcessWorldImage;
}

/** Registers the profile-scoped badge read route at its original position. */
export function registerPlayerBadgeRoutes(app: Express, { storage, isAuthenticated }: BadgeRouteDependencies): void {
  app.get("/api/users/:userId/badges", isAuthenticated, async (req, res) => {
    try {
      const badges = await storage.getUserBadges((req.params.userId as string));
      return res.json(badges);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch badges" });
    }
  });
}

/**
 * Registers the badge-domain HTTP boundary at its original route-registration
 * position. Shared award/backfill helpers deliberately remain in routes.ts:
 * fishing, PvP, purchases, and startup reconciliation call them directly.
 */
export function registerBadgeRoutes(app: Express, dependencies: BadgeRouteDependencies, phase: "definitions" | "leaderboards" | "claims" | "all" = "all"): void {
  const { storage, db, isAuthenticated, processWorldImage } = dependencies;
  if (phase === "definitions" || phase === "all") {
app.get("/api/badges", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const all = await storage.getAllBadges();
    if (user?.isAdmin) return res.json(all);
    // For non-admins: filter out hidden badges unless they own it
    const earnedIds = new Set((await storage.getUserBadges(user.id)).map((ub: any) => ub.badgeId));
    return res.json(all.filter((b: any) => !b.hidden || earnedIds.has(b.id)));
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch badges" });
  }
});

app.post("/api/admin/badges", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const { name, imageData, dailyRewardCoins, badgePoints, claimType } = req.body;
    if (!name || !imageData) return res.status(400).json({ message: "name and imageData required" });
    const imageUrl = await processWorldImage(imageData, 1000);
    const validClaimType = ["daily", "weekly", "monthly"].includes(claimType) ? claimType : "daily";
    const badge = await storage.createBadge(name, imageUrl, dailyRewardCoins ? Number(dailyRewardCoins) : null, badgePoints ? Number(badgePoints) : 0, validClaimType);
    return res.json(badge);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to create badge" });
  }
});

app.delete("/api/admin/badges/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    await storage.deleteBadge((req.params.id as string));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete badge" });
  }
});

app.patch("/api/admin/badges/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const { dailyRewardCoins, badgePoints, name, imageData, claimType, rarity, obtainDescription } = req.body;
    const updateData: { dailyRewardCoins?: number | null; badgePoints?: number; name?: string; imageUrl?: string; claimType?: string; rarity?: string; obtainDescription?: string | null } = {};
    if (dailyRewardCoins !== undefined) {
      updateData.dailyRewardCoins = dailyRewardCoins != null && dailyRewardCoins !== "" ? Number(dailyRewardCoins) : null;
    }
    if (badgePoints !== undefined) {
      updateData.badgePoints = badgePoints != null && badgePoints !== "" ? Number(badgePoints) : 0;
    }
    if (name !== undefined && name.trim()) {
      updateData.name = name.trim();
    }
    if (imageData) {
      updateData.imageUrl = await processWorldImage(imageData, 1000);
    }
    if (claimType !== undefined) {
      updateData.claimType = ["daily", "weekly", "monthly"].includes(claimType) ? claimType : "daily";
    }
    if (rarity !== undefined) {
      const valid = ["common", "uncommon", "rare", "epic", "legendary"];
      updateData.rarity = valid.includes(rarity) ? rarity : "common";
    }
    if (obtainDescription !== undefined) {
      updateData.obtainDescription = obtainDescription ? String(obtainDescription).trim() || null : null;
    }
    if (req.body.hidden !== undefined) {
      (updateData as any).hidden = Boolean(req.body.hidden);
    }
    await storage.updateBadge((req.params.id as string), updateData);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to update badge" });
  }
});
  }

  if (phase === "leaderboards" || phase === "all") {
app.get("/api/badges/leaderboard", async (_req, res) => {
  try {
    const leaderboard = await storage.getBadgeLeaderboard(50);
    // Hint to clients/CDNs that this list can be reused briefly. Saves
    // round trips when multiple Hub components mount in quick succession.
    res.set("Cache-Control", "private, max-age=10");
    return res.json(leaderboard);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to fetch leaderboard" });
  }
});
app.get("/api/badges/leaderboard/devotion", async (_req, res) => {
  try {
    const leaderboard = await storage.getDevotionLeaderboard(50);
    res.set("Cache-Control", "private, max-age=10");
    return res.json(leaderboard);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to fetch devotion leaderboard" });
  }
});
  }

  if (phase === "claims" || phase === "all") {
app.get("/api/admin/badges/:id/recipients", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const recipients = await storage.getBadgeRecipients((req.params.id as string));
    return res.json(recipients);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch recipients" });
  }
});

app.post("/api/admin/badges/:id/award", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) return res.status(400).json({ message: "userIds array required" });
    for (const uid of userIds) {
      await storage.awardBadge(uid, (req.params.id as string));
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to award badge" });
  }
});

app.post("/api/admin/badges/:id/revoke", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) return res.status(400).json({ message: "userIds array required" });
    for (const uid of userIds) {
      await storage.revokeBadge(uid, (req.params.id as string));
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to revoke badge" });
  }
});

app.get("/api/user/badges", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const myBadges = await storage.getUserBadges(user.id);
    return res.json(myBadges);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch user badges" });
  }
});

app.post("/api/badges/claim-daily", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.emailVerified) {
      return res.status(403).json({ message: "Please verify your email before claiming rewards", code: "EMAIL_UNVERIFIED" });
    }
    const { badgeId } = req.body;
    if (!badgeId) return res.status(400).json({ message: "badgeId required" });

    const claim = await db.transaction(async (tx) => {
      // This transaction-scoped advisory lock covers the absent-row case.
      // It serializes this user/badge pair even though the current schema has
      // no unique constraint on badge_reward_claims(user_id, badge_id).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id})::int, hashtext(${badgeId})::int)`);

      let badge: any;
      // Properties are intentionally used instead of closure-assigned local
      // variables: TypeScript otherwise narrows the outer locals to their
      // initial null/undefined values after the async state callback.
      const claimTiming: { lastClaimedAt: Date | null; databaseNow: Date | undefined } = {
        lastClaimedAt: null,
        databaseNow: undefined,
      };
      let reward = 0;
      let cooldownMs = 0;
      let periodLabel = "today";
      let newCoins: number | undefined;
      const result = await executeBadgePeriodicClaim({
        state: async () => {
          // Lock every historical duplicate unlock/claim row for this pair,
          // then use the server-owned definition and PostgreSQL time.
          const owned = await tx.execute(sql`
            SELECT b.daily_reward_coins, b.claim_type
            FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
            WHERE ub.user_id = ${user.id} AND ub.badge_id = ${badgeId}
            FOR UPDATE OF ub, b
          `);
          badge = owned.rows[0] as any;
          if (!badge) return "not-owned";
          const claims = await tx.execute(sql`
            SELECT last_claimed_at FROM badge_reward_claims
            WHERE user_id = ${user.id} AND badge_id = ${badgeId}
            FOR UPDATE
          `);
          claimTiming.lastClaimedAt = claims.rows.reduce<Date | null>((latest, row: any) => {
            const claimedAt = new Date(row.last_claimed_at);
            return !latest || claimedAt > latest ? claimedAt : latest;
          }, null);
          const nowResult = await tx.execute(sql`SELECT NOW() AS now`);
          claimTiming.databaseNow = new Date((nowResult.rows[0] as any).now);
          reward = Number(badge.daily_reward_coins);
          if (!Number.isSafeInteger(reward) || reward <= 0) return "no-reward";
          const claimType = badge.claim_type ?? "daily";
          cooldownMs = claimType === "monthly" ? 30 * 24 * 60 * 60 * 1000 : claimType === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
          periodLabel = claimType === "monthly" ? "this month" : claimType === "weekly" ? "this week" : "today";
          return claimTiming.lastClaimedAt && claimTiming.databaseNow.getTime() - claimTiming.lastClaimedAt.getTime() < cooldownMs ? "cooldown" : "ready";
        },
        reserve: async () => true,
        grantCoins: async () => {
          const updated = await tx.execute(sql`
            UPDATE users SET coins = GREATEST(0, coins + ${reward}), total_coins_earned = total_coins_earned + ${reward}
            WHERE id = ${user.id} RETURNING coins
          `);
          if (!updated.rows.length) throw new Error("User not found");
          newCoins = Number((updated.rows[0] as any).coins);
        },
        commit: async () => {
          if (!claimTiming.databaseNow) throw new Error("Database claim time missing");
          const updated = await tx.execute(sql`
            UPDATE badge_reward_claims SET last_claimed_at = ${claimTiming.databaseNow}
            WHERE user_id = ${user.id} AND badge_id = ${badgeId} RETURNING id
          `);
          if (!updated.rows.length) await tx.execute(sql`
            INSERT INTO badge_reward_claims (user_id, badge_id, last_claimed_at)
            VALUES (${user.id}, ${badgeId}, ${claimTiming.databaseNow})
          `);
        },
      });
      return { result, reward, newCoins, cooldownMs, periodLabel, ...claimTiming };
    });
    if (claim.result === "not-owned") return res.status(403).json({ message: "You don't have this badge" });
    if (claim.result === "no-reward") return res.status(400).json({ message: "This badge has no coin reward" });
    if (claim.result === "cooldown" || claim.result === "already-claimed") {
      const msLeft = claim.lastClaimedAt && claim.databaseNow
        ? Math.max(0, claim.cooldownMs - (claim.databaseNow.getTime() - claim.lastClaimedAt.getTime()))
        : claim.cooldownMs;
      return res.status(429).json({ message: `Already claimed ${claim.periodLabel}`, msLeft });
    }
    return res.json({ coinsAwarded: claim.reward, newCoins: claim.newCoins });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to claim reward" });
  }
});
  }
}
