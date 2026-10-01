import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { houseBundles as houseBundlesTable } from "@shared/schema";
import { DEFAULT_OUTDOOR_DECOR_LIMIT, DEFAULT_OUTDOOR_PET_LIMIT, isBuildingSize, isHouseBuildingType } from "@shared/housing";
import type { db as database } from "../db";
import type { IStorage } from "../storage";

export interface HouseBundleRouteDependencies {
  db: typeof database;
  storage: IStorage;
  isAdmin: RequestHandler;
  processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
}

/**
 * Player + admin house bundle routes.
 *
 * This module preserves the legacy URLs, public/auth boundaries, status codes,
 * response shapes, image processing limits, purchase/refund behavior, and
 * bundle-building editing rules.
 */
export function registerHouseBundleRoutes(
  app: Express,
  { db, storage, isAdmin, processWorldImage }: HouseBundleRouteDependencies,
): void {
  // ── Player House Bundle Routes ──────────────────────────────────────────────
  app.get("/api/house-bundles", async (_req, res) => {
    try {
      const bundles = await storage.getHouseBundles();
      return res.json(bundles);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:userId/house-bundles", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const owned = await storage.getUserHouseBundles(userId);
      return res.json(owned);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:userId/active-house-bundle", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const bundle = await storage.getActiveBundleWithBuildings(userId);
      return res.json(bundle ?? null);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/:bundleId/purchase", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const { bundleId } = req.params as { bundleId: string };
      const [bundle] = await db.select().from(houseBundlesTable).where(eq(houseBundlesTable.id, bundleId));
      if (!bundle) return res.status(404).json({ message: "Bundle not found" });
      const alreadyOwns = await storage.hasUserHouseBundle(user.id, bundleId);
      if (alreadyOwns) return res.status(400).json({ message: "Already owned" });

      // Atomic deduct using fresh DB coins value (not stale session), prevents double-purchase races
      const afterDeduct = await storage.atomicDeductCoins(user.id, bundle.price);
      if (!afterDeduct) return res.status(400).json({ message: "Not enough coins" });
      try {
        const owned = await storage.grantUserHouseBundle(user.id, bundleId);
        return res.status(201).json(owned);
      } catch (grantErr: any) {
        // If grant fails (e.g. duplicate), refund coins
        await storage.addCoins(user.id, bundle.price);
        if (grantErr.code === "23505") return res.status(400).json({ message: "Already owned" });
        throw grantErr;
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/:bundleId/activate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const { bundleId } = req.params as { bundleId: string };
      const owns = await storage.hasUserHouseBundle(user.id, bundleId);
      if (!owns) return res.status(403).json({ message: "Bundle not owned" });
      await storage.setActiveHouseBundle(user.id, bundleId);
      const bundle = await storage.getActiveBundleWithBuildings(user.id);
      return res.json(bundle);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/deactivate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      await storage.setActiveHouseBundle(user.id, null);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── House Bundles ───────────────────────────────────────────────────────────
  app.get("/api/admin/house-bundles", isAdmin, async (_req, res) => {
    try {
      const bundles = await storage.getHouseBundles();
      return res.json(bundles);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundles", isAdmin, async (req, res) => {
    try {
      const { name, price, shopImageData, bgImageData, maxOutdoorPets, maxOutdoorDecor } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      let shopImageUrl: string | undefined;
      let bgImageUrl: string | undefined;
      if (shopImageData) shopImageUrl = await processWorldImage(shopImageData, 1000);
      if (bgImageData) bgImageUrl = await processWorldImage(bgImageData, 3000);
      const bundle = await storage.createHouseBundle({
        name,
        price: price ?? 0,
        shopImageUrl,
        bgImageUrl,
        maxOutdoorPets: Math.max(0, Number(maxOutdoorPets ?? DEFAULT_OUTDOOR_PET_LIMIT)),
        maxOutdoorDecor: Math.max(0, Number(maxOutdoorDecor ?? DEFAULT_OUTDOOR_DECOR_LIMIT)),
      });
      return res.status(201).json(bundle);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/house-bundles/:id", isAdmin, async (req, res) => {
    try {
      const { name, price, shopImageData, bgImageData, giftNotificationX, giftNotificationY, maxOutdoorPets, maxOutdoorDecor } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (price !== undefined) updates.price = price;
      if (shopImageData) updates.shopImageUrl = await processWorldImage(shopImageData, 1000);
      if (bgImageData) updates.bgImageUrl = await processWorldImage(bgImageData, 3000);
      if (giftNotificationX !== undefined) updates.giftNotificationX = giftNotificationX;
      if (giftNotificationY !== undefined) updates.giftNotificationY = giftNotificationY;
      if (maxOutdoorPets !== undefined) updates.maxOutdoorPets = Math.max(0, Number(maxOutdoorPets));
      if (maxOutdoorDecor !== undefined) updates.maxOutdoorDecor = Math.max(0, Number(maxOutdoorDecor));
      const bundle = await storage.updateHouseBundle(req.params.id as string, updates);
      return res.json(bundle);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/house-bundles/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteHouseBundle(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── House Bundle Buildings ─────────────────────────────────────────────────
  app.get("/api/admin/house-bundles/:bundleId/buildings", isAdmin, async (req, res) => {
    try {
      const buildings = await storage.getHouseBundleBuildings(req.params.bundleId as string);
      return res.json(buildings);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundles/:bundleId/buildings", isAdmin, async (req, res) => {
    try {
      const { name, imageData, size, buildingType } = req.body;
      if (!name || !imageData) return res.status(400).json({ message: "name and imageData are required" });
      const type = isHouseBuildingType(buildingType) ? buildingType : "building";
      if (type === "building" && size !== undefined && !isBuildingSize(size)) {
        return res.status(400).json({ message: "size must be small, medium, or large" });
      }
      const imageUrl = await processWorldImage(imageData, 1000);
      const building = await storage.createHouseBundleBuilding({
        bundleId: req.params.bundleId as string,
        name,
        imageUrl,
        buildingType: type,
        ...(type === "building" && isBuildingSize(size) ? { size } : {}),
      });
      return res.status(201).json(building);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/house-bundle-buildings/:id", isAdmin, async (req, res) => {
    try {
      const {
        name,
        posX,
        posY,
        width,
        flippedX,
        imageData,
        interiorImageData,
        clearInterior,
        size,
        buildingType,
        leaveButtonX,
        leaveButtonY,
        maxPets,
      } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (posX !== undefined) updates.posX = posX;
      if (posY !== undefined) updates.posY = posY;
      if (width !== undefined) updates.width = Math.max(20, Math.min(400, Number(width)));
      if (flippedX !== undefined) updates.flippedX = Boolean(flippedX);
      if (imageData) updates.imageUrl = await processWorldImage(imageData, 1000);
      if (interiorImageData) updates.interiorImageUrl = await processWorldImage(interiorImageData, 2000);
      if (clearInterior) updates.interiorImageUrl = null;
      if (size !== undefined) {
        if (!isBuildingSize(size)) return res.status(400).json({ message: "size must be small, medium, or large" });
        updates.size = size;
      }
      if (buildingType !== undefined) {
        if (!isHouseBuildingType(buildingType)) return res.status(400).json({ message: "buildingType must be building or mailbox" });
        updates.buildingType = buildingType;
      }
      if (leaveButtonX !== undefined) updates.leaveButtonX = Math.max(0, Math.min(1, Number(leaveButtonX)));
      if (leaveButtonY !== undefined) updates.leaveButtonY = Math.max(0, Math.min(1, Number(leaveButtonY)));
      if (maxPets !== undefined) updates.maxPets = maxPets === null ? null : Math.max(0, Number(maxPets));
      const building = await storage.updateHouseBundleBuilding(req.params.id as string, updates);
      return res.json(building);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/house-bundle-buildings/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteHouseBundleBuilding(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundle-buildings/:id/duplicate", isAdmin, async (req, res) => {
    try {
      const source = await storage.getHouseBundleBuilding(req.params.id as string);
      if (!source) return res.status(404).json({ message: "Building not found" });
      const duplicate = await storage.createHouseBundleBuilding({
        bundleId: source.bundleId,
        name: source.name,
        imageUrl: source.imageUrl,
        posX: Math.min(95, source.posX + 5),
        posY: Math.min(95, source.posY + 5),
        width: source.width,
        flippedX: source.flippedX,
        interiorImageUrl: source.interiorImageUrl,
        buildingType: source.buildingType,
        size: source.size,
      });
      return res.status(201).json(duplicate);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
