import type { Express, RequestHandler } from "express";

type HomeDecorStorage = Pick<typeof import("../storage").storage,
  "getUserHomeDecorInventory" | "getPlacedHomeDecor" | "updatePlacedHomeDecor"
>;
type DecorTransactions = typeof import("../housing/decorTransactions");

export interface HomeDecorRouteDependencies {
  storage: HomeDecorStorage;
  isAuthenticated: RequestHandler;
  executeDecorPlacement: DecorTransactions["executeDecorPlacement"];
  executeDecorRemoval: DecorTransactions["executeDecorRemoval"];
}

export function registerHomeDecorRoutes(app: Express, dependencies: HomeDecorRouteDependencies): void {
  const { storage, isAuthenticated, executeDecorPlacement, executeDecorRemoval } = dependencies;

  app.get("/api/pet-house/decor/inventory", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const items = await storage.getUserHomeDecorInventory(userId);
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/pet-house/decor/placed", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const location = req.query.location as string | undefined;
      const items = await storage.getPlacedHomeDecor(userId, location);
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Public endpoint — lets visitors see another player's placed decor
  app.get("/api/users/:userId/pet-house/decor/placed", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const location = req.query.location as string | undefined;
      const items = await storage.getPlacedHomeDecor(userId, location);
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pet-house/decor/place", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { decorItemId, xPct, yPct, size, flipped, location } = req.body;
      if (!decorItemId) return res.status(400).json({ message: "decorItemId required" });
      const row = await executeDecorPlacement(userId, decorItemId, {
        xPct: xPct ?? 0.5,
        yPct: yPct ?? 0.5,
        size: size ?? 250,
        flipped: flipped ?? false,
        location: location ?? "outside",
      });
      return res.status(201).json(row);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/pet-house/decor/placed/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { xPct, yPct, size, flipped } = req.body;
      const row = await storage.updatePlacedHomeDecor((req.params.id as string), userId, { xPct, yPct, size, flipped });
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/pet-house/decor/placed/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const result = await executeDecorRemoval(userId, (req.params.id as string));
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
