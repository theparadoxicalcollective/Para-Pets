import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";

type HubNoticeDb = Pick<typeof import("../db").db, "execute">;

export interface HubNoticeRouteDependencies {
  db: HubNoticeDb;
  isAuthenticated: RequestHandler;
}

/**
 * Para Pets Hub notice routes.
 *
 * Preserves the public read endpoint and the existing authenticated admin
 * checks, SQL, defaults, response shapes, status codes, and error behavior.
 */
export function registerHubNoticeRoutes(
  app: Express,
  { db, isAuthenticated }: HubNoticeRouteDependencies,
): void {
  app.get("/api/hub/notices", async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, image_url, href, label, sort_order, created_at
        FROM hub_notices ORDER BY sort_order ASC, created_at ASC
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/hub/notices", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { image_url, href = "", label = "", sort_order = 0 } = req.body;
      if (!image_url) {
        return res.status(400).json({ message: "image_url required" });
      }
      const rows = await db.execute(sql`
        INSERT INTO hub_notices (image_url, href, label, sort_order)
        VALUES (${image_url}, ${href}, ${label}, ${sort_order})
        RETURNING id, image_url, href, label, sort_order, created_at
      `);
      return res.json(rows.rows[0]);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/hub/notices/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      await db.execute(sql`DELETE FROM hub_notices WHERE id = ${req.params.id}`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
