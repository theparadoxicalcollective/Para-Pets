import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import { claimFirstCardReward } from "../cards";
import { serializeCard, serializeLayout } from "./cardAdmin.routes";

export function registerCardCollectionRoutes(app: Express, { db, isAuthenticated }: {
  db: typeof database; isAuthenticated: RequestHandler;
}) {
  app.get("/api/cards", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const [owned, catalog, layouts] = await Promise.all([
        db.execute(sql`SELECT c.*, u.quantity, u.first_reward_claimed_at
          FROM user_cards u JOIN card_definitions c ON c.id = u.card_id
          WHERE u.user_id = ${userId} AND u.quantity > 0 ORDER BY c.rarity DESC, c.name, c.id`),
        db.execute(sql`SELECT COUNT(*)::int AS total FROM card_definitions`),
        db.execute(sql`SELECT * FROM card_border_layouts ORDER BY rarity`),
      ]);
      return res.json({
        cards: owned.rows.map((row: any) => ({ ...serializeCard(row), quantity: Number(row.quantity), firstRewardClaimed: row.first_reward_claimed_at != null })),
        totalCards: Number(catalog.rows[0]?.total ?? 0),
        layouts: layouts.rows.map(serializeLayout),
      });
    } catch (error) {
      console.error("[cards] collection failed:", error);
      return res.status(500).json({ message: "Failed to load your cards" });
    }
  });

  app.post("/api/cards/:id/claim", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string; emailVerified: boolean };
      if (!user.emailVerified) return res.status(403).json({ message: "Please verify your email before claiming rewards", code: "EMAIL_UNVERIFIED" });
      const result = await claimFirstCardReward(db, user.id, req.params.id as string);
      if (!result.claimed) return res.status(409).json({ message: "Card not owned or reward already claimed" });
      return res.json(result);
    } catch (error) {
      console.error("[cards] reward claim failed:", error);
      return res.status(500).json({ message: "Could not claim card reward. Please try again." });
    }
  });
}
