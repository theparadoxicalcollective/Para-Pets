import type { Express, RequestHandler } from "express";

type FounderStorage = Pick<typeof import("../storage").storage,
  | "getFounders"
  | "addFounder"
  | "updateFounderName"
  | "updateFounderTier"
  | "deleteFounder"
>;

export interface FounderRouteDependencies {
  storage: FounderStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Founder/supporter routes.
 *
 * Preserves the public read endpoint and the existing authenticated admin
 * checks, validation, response shapes, and storage calls while keeping this
 * unrelated CRUD group out of the legacy route registry.
 */
export function registerFounderRoutes(
  app: Express,
  { storage, isAuthenticated }: FounderRouteDependencies,
): void {
  app.get("/api/founders", async (_req, res) => {
    try {
      const list = await storage.getFounders();
      return res.json(list);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/founders", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name required" });
      }
      if (name.trim().length > 120) {
        return res.status(400).json({ message: "Name too long (max 120)" });
      }
      const row = await storage.addFounder(name.trim(), user.username);
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/founders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const id = String(req.params.id);
      const { tier, name } = req.body;

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({ message: "name must be a non-empty string" });
        }
        const row = await storage.updateFounderName(id, name.trim());
        return res.json(row);
      }

      const validTiers = ["bronze", "silver", "gold", null];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ message: "tier must be bronze, silver, gold, or null" });
      }
      const row = await storage.updateFounderTier(id, tier ?? null);
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/founders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteFounder(String(req.params.id));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
