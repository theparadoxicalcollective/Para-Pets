import type { Express, RequestHandler } from "express";
import { clampHomeScenePlayerSize, getHouseBuildingDecorLimit, getHouseOutdoorDecorLimit, homeSceneItemCountsTowardDecorLimit, sanitizeHomeCatalogEffect } from "@shared/housing";

type HomeDecorStorage = Pick<typeof import("../storage").storage,
  | "getHomeDecorItems"
  | "createHomeDecorItem"
  | "updateHomeDecorItem"
  | "deleteHomeDecorItem"
  | "getAllShopItems"
  | "getShopItem"
  | "updateShopItem"
  | "getLocationHomeDecor"
  | "addDecorToShop"
  | "removeDecorFromShop"
  | "getAllUsers"
  | "grantHomeDecorToUser"
  | "getUserHomeDecorInventory"
  | "getActiveBundleWithBuildings"
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
  applyBundleTemplates?: (userId: string) => Promise<unknown>;
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
    applyBundleTemplates = async () => undefined,
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

  app.patch("/api/admin/home-decor/:id", isAdmin, async (req, res) => {
    try {
      const patch: Record<string, unknown> = {};
      if (req.body?.homeSceneSize !== undefined) {
        const homeSceneSize = Math.max(60, Math.min(500, Math.round(Number(req.body.homeSceneSize))));
        if (!Number.isFinite(homeSceneSize)) return res.status(400).json({ message: "homeSceneSize must be a number" });
        patch.homeSceneSize = homeSceneSize;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "homeEffect")) {
        const raw = req.body?.homeEffect;
        const homeEffect = sanitizeHomeCatalogEffect("decor", raw);
        if (raw !== null && raw !== "" && homeEffect === null) {
          return res.status(400).json({ message: "Decor effect must be sleep, lamp_light, or null" });
        }
        patch.homeEffect = homeEffect;
      }
      if (req.body?.homeEffectX !== undefined) {
        const value = Number(req.body.homeEffectX);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "homeEffectX must be a number" });
        patch.homeEffectX = Math.max(-0.5, Math.min(1.5, value));
      }
      if (req.body?.homeEffectY !== undefined) {
        const value = Number(req.body.homeEffectY);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "homeEffectY must be a number" });
        patch.homeEffectY = Math.max(-0.5, Math.min(1.5, value));
      }
      if (req.body?.homeEffectSize !== undefined) {
        const value = Math.round(Number(req.body.homeEffectSize));
        if (!Number.isFinite(value)) return res.status(400).json({ message: "homeEffectSize must be a number" });
        patch.homeEffectSize = Math.max(10, Math.min(220, value));
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No Home Decor changes supplied" });
      const item = await storage.updateHomeDecorItem(req.params.id as string, patch as any);
      return res.json(item);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/home-objects", isAdmin, async (_req, res) => {
    try {
      const items = await storage.getAllShopItems();
      return res.json(items.filter((item) => item.type === "object"));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/home-objects/:id", isAdmin, async (req, res) => {
    try {
      const existing = await storage.getShopItem(req.params.id as string);
      if (!existing || existing.type !== "object") {
        return res.status(404).json({ message: "Object not found" });
      }
      const patch: Record<string, unknown> = {};
      if (req.body?.homeSceneSize !== undefined) {
        const homeSceneSize = Math.max(60, Math.min(500, Math.round(Number(req.body.homeSceneSize))));
        if (!Number.isFinite(homeSceneSize)) return res.status(400).json({ message: "homeSceneSize must be a number" });
        patch.homeSceneSize = homeSceneSize;
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "homeEffect")) {
        const raw = req.body?.homeEffect;
        const homeEffect = sanitizeHomeCatalogEffect("object", raw);
        if (raw !== null && raw !== "" && homeEffect === null) {
          return res.status(400).json({ message: "Object effect must be lamp_light, tap, or null" });
        }
        patch.homeEffect = homeEffect;
      }
      if (req.body?.homeEffectX !== undefined) {
        const value = Number(req.body.homeEffectX);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "homeEffectX must be a number" });
        patch.homeEffectX = Math.max(-0.5, Math.min(1.5, value));
      }
      if (req.body?.homeEffectY !== undefined) {
        const value = Number(req.body.homeEffectY);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "homeEffectY must be a number" });
        patch.homeEffectY = Math.max(-0.5, Math.min(1.5, value));
      }
      if (req.body?.homeEffectSize !== undefined) {
        const value = Math.round(Number(req.body.homeEffectSize));
        if (!Number.isFinite(value)) return res.status(400).json({ message: "homeEffectSize must be a number" });
        patch.homeEffectSize = Math.max(10, Math.min(220, value));
      }
      if (typeof req.body?.homeTapImageData === "string" && req.body.homeTapImageData) {
        patch.homeTapImageUrl = await processWorldImage(req.body.homeTapImageData, 2000);
      }
      if (req.body?.clearHomeTapImage === true) {
        patch.homeTapImageUrl = null;
      }

      const nextEffect = Object.prototype.hasOwnProperty.call(patch, "homeEffect")
        ? patch.homeEffect
        : existing.homeEffect;
      const nextTapImageUrl = Object.prototype.hasOwnProperty.call(patch, "homeTapImageUrl")
        ? patch.homeTapImageUrl
        : existing.homeTapImageUrl;
      if (nextEffect === "tap" && !nextTapImageUrl) {
        return res.status(400).json({ message: "Tap effect requires an alternate Tap image" });
      }

      if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No Home Object changes supplied" });
      const item = await storage.updateShopItem(existing.id, patch as any);
      return res.json(item);
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
      await applyBundleTemplates(userId);
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
      const { decorItemId, xPct, yPct, flipped, location } = req.body;
      if (!decorItemId) return res.status(400).json({ message: "decorItemId required" });

      const targetLocation = typeof location === "string" && location ? location : "outside";
      const inventory = await storage.getUserHomeDecorInventory(userId);
      const sourceItem = inventory.find((entry) => entry.decorItemId === decorItemId && entry.quantity > 0);

      if (sourceItem && homeSceneItemCountsTowardDecorLimit(sourceItem.item.type)) {
        const activeBundle = await storage.getActiveBundleWithBuildings(userId);
        const placed = await storage.getPlacedHomeDecor(userId, targetLocation);
        const decorCount = placed.filter((entry) => homeSceneItemCountsTowardDecorLimit(entry.item.type)).length;

        let decorLimit: number;
        if (targetLocation === "outside") {
          decorLimit = getHouseOutdoorDecorLimit(activeBundle);
        } else {
          const building = activeBundle?.buildings.find((candidate) => candidate.id === targetLocation);
          if (!building || building.buildingType === "mailbox") {
            return res.status(400).json({ message: "Home building not found" });
          }
          decorLimit = getHouseBuildingDecorLimit(building);
        }

        if (decorCount >= decorLimit) {
          return res.status(409).json({
            code: "decor_limit",
            message: `This home can only hold ${decorLimit} decor items`,
            limit: decorLimit,
          });
        }
      }

      const row = await executeDecorPlacement(userId, decorItemId, {
        xPct: xPct ?? 0.5,
        yPct: yPct ?? 0.5,
        flipped: flipped ?? false,
        location: targetLocation,
      });
      return res.status(201).json(row);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/pet-house/decor/placed/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { xPct, yPct, size, flipped, effectEnabled } = req.body;
      let safeSize: number | undefined;
      let safeEffectEnabled: boolean | undefined;
      let placement: Awaited<ReturnType<typeof storage.getPlacedHomeDecor>>[number] | undefined;

      if (size !== undefined || effectEnabled !== undefined) {
        const placements = await storage.getPlacedHomeDecor(userId);
        placement = placements.find((item) => item.id === (req.params.id as string));
        if (!placement) return res.status(404).json({ message: "Placed decor not found" });
      }

      if (size !== undefined && placement) {
        safeSize = clampHomeScenePlayerSize(placement.item.homeSceneSize, Number(size));
      }

      if (effectEnabled !== undefined && placement) {
        const isLampToggle = placement.item.homeEffect === "lamp_light";
        const isTapImageToggle = placement.item.type === "object" && placement.item.homeEffect === "tap";
        if (!isLampToggle && !isTapImageToggle) {
          return res.status(400).json({ message: "This Home item has no tap effect" });
        }
        safeEffectEnabled = effectEnabled === true;
      }

      const placementPatch: Partial<{ xPct: number; yPct: number; size: number; flipped: boolean; effectEnabled: boolean }> = {
        xPct,
        yPct,
        size: safeSize,
        flipped,
      };
      if (safeEffectEnabled !== undefined) placementPatch.effectEnabled = safeEffectEnabled;

      const row = await storage.updatePlacedHomeDecor(
        req.params.id as string,
        userId,
        placementPatch,
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
