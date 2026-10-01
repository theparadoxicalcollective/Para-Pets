import type { Express, RequestHandler } from "express";

type HomeDecorStorage = Pick<typeof import("../storage").storage,
  | "getHomeDecorItems"
  | "createHomeDecorItem"
  | "deleteHomeDecorItem"
  | "getLocationHomeDecor"
  | "addDecorToShop"
  | "removeDecorFromShop"
  | "getAllUsers"
  | "grantHomeDecorToUser"
  | "getUserHomeDecorInventory"
  | "getPlacedHomeDecor"
  | "updatePlacedHomeDecor"
>;
type DecorTransactions = typeof import("../housing/decorTransactions");

export interface HomeDecorRouteDependencies {
  storage: HomeDecorStorage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
  executeDecorPlacement: DecorTransactions["executeDecorPlacement"];
  executeDecorRemoval: DecorTransactions["executeDecorRemoval"];
  processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
}

/**
 * Complete Home Decor route module.
 *
 * Owns the admin decor catalog, world-shop decor assignment, player decor/object
 * inventory + placement, and bulk decor grants while preserving the legacy API
 * contracts from server/routes.ts.
 */
export function registerHomeDecorRoutes(
  app: Express,
  dependencies: HomeDecorRouteDependencies,
): void {
  const {
    storage,
    isAuthenticated,
    isAdmin,
    executeDecorPlacement,
    executeDecorRemoval,
    processWorldImage,
  } = dependencies;

  // ── Admin: Home Decor catalog ───────────────────────────────────────────────
  app.get("/api/admin/home-decor", isAdmin, async (_req, res) => {
    try {
      const items = await storage.getHomeDecorItems();
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/home-decor", isAdmin, async (req, res) => {
    try {
      const { name, price, imageData } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      let imageUrl: string | undefined;
      if (imageData) imageUrl = await processWorldImage(imageData, 2000);
      const item = await storage.createHomeDecorItem({
        name,
        price: price ?? 0,
        imageUrl,
      });
      return res.status(201).json(item);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/home-decor/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteHomeDecorItem(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin/player: location Home Decor shop stock ───────────────────────────
  app.get("/api/admin/location/:locationId/shop-decor", isAdmin, async (req, res) => {
    try {
      const rows = await storage.getLocationHomeDecor(req.params.locationId as string);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/location/:locationId/assign-decor/:decorId", isAdmin, async (req, res) => {
    try {
      const row = await storage.addDecorToShop(
        req.params.locationId as string,
        req.params.decorId as string,
      );
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-decor/:decorId", isAdmin, async (req, res) => {
    try {
      await storage.removeDecorFromShop(
        req.params.locationId as string,
        req.params.decorId as string,
      );
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/locations/:locationId/shop-decor", isAuthenticated, async (req, res) => {
    try {
      const rows = await storage.getLocationHomeDecor(req.params.locationId as string);
      return res.json(rows.map((row) => row.decor));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Player Home Decor/Object inventory + placement ─────────────────────────
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

  // Public endpoint — lets visitors see another player's placed decor/objects.
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
      const row = await storage.updatePlacedHomeDecor(
        req.params.id as string,
        userId,
        { xPct, yPct, size, flipped },
      );
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/pet-house/decor/placed/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const result = await executeDecorRemoval(userId, req.params.id as string);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: grant one Home Decor catalog item to every player ───────────────
  app.post("/api/admin/home-decor/:id/grant-everyone", isAdmin, async (req, res) => {
    try {
      const decorItemId = req.params.id as string;
      const allUsers = await storage.getAllUsers();
      let granted = 0;
      for (const user of allUsers) {
        await storage.grantHomeDecorToUser(user.id, decorItemId);
        granted++;
      }
      return res.json({ ok: true, granted });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
