import type { Express, RequestHandler } from "express";
import { and, asc, eq } from "drizzle-orm";
import { homeDecorItems, houseBundleIncludedItems, houseBundles as houseBundlesTable, shopItems } from "@shared/schema";
import { DEFAULT_OUTDOOR_DECOR_LIMIT, DEFAULT_OUTDOOR_PET_LIMIT, isBuildingSize, isHomeOutdoorLightingMode, isHouseBuildingType, isHouseInteriorLightEffectType, sanitizeHouseBundleIncludedItemQuantity, sanitizeHouseInteriorDarkness, sanitizeHouseInteriorEffects, sanitizeHouseOutdoorEffects } from "@shared/housing";
import type { db as database } from "../db";
import type { IStorage } from "../storage";
import { executeStoreAllHomeScene } from "../housing/decorTransactions";
import { applyActiveHouseBundleIncludedItemTemplates, ensureAllOwnedHouseBundleIncludedItemsGranted } from "../housing/bundleContents";

export interface HouseBundleRouteDependencies {
  db: typeof database;
  storage: IStorage;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
  processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
  storeAllHomeScene?: (userId: string) => Promise<{ returnedDecor: number; returnedObjects: number; returnedPets: number }>;
  ensureIncludedItemsGranted?: (userId: string) => Promise<unknown>;
  applyIncludedItemTemplates?: (userId: string, bundleId?: string) => Promise<unknown>;
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
  { db, storage, isAuthenticated, isAdmin, processWorldImage, storeAllHomeScene = executeStoreAllHomeScene, ensureIncludedItemsGranted = ensureAllOwnedHouseBundleIncludedItemsGranted, applyIncludedItemTemplates = applyActiveHouseBundleIncludedItemTemplates }: HouseBundleRouteDependencies,
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
      if (req.isAuthenticated() && (req.user as any)?.id === userId) {
        await ensureIncludedItemsGranted(userId);
      }
      const owned = await storage.getUserHouseBundles(userId);
      return res.json(owned);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:userId/active-house-bundle", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const isSelf = req.isAuthenticated() && (req.user as any)?.id === userId;
      if (isSelf) await ensureIncludedItemsGranted(userId);
      const bundle = await storage.getActiveBundleWithBuildings(userId);
      if (isSelf && bundle) await applyIncludedItemTemplates(userId, bundle.id);
      return res.json(bundle ?? null);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/house-bundles/:bundleId/player-lighting", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const { bundleId } = req.params as { bundleId: string };
      const owns = await storage.hasUserHouseBundle(user.id, bundleId);
      if (!owns) return res.status(403).json({ message: "Bundle not owned" });

      const { outdoorMode, buildingId, effectId, off } = req.body ?? {};
      const hasOutdoorMode = outdoorMode !== undefined;
      const hasInteriorToggle = buildingId !== undefined || effectId !== undefined || off !== undefined;
      if (!hasOutdoorMode && !hasInteriorToggle) {
        return res.status(400).json({ message: "Lighting update is required" });
      }

      if (hasOutdoorMode && !isHomeOutdoorLightingMode(outdoorMode)) {
        return res.status(400).json({ message: "outdoorMode must be auto, day, or night" });
      }

      if (hasInteriorToggle) {
        if (typeof buildingId !== "string" || typeof effectId !== "string" || typeof off !== "boolean") {
          return res.status(400).json({ message: "buildingId, effectId, and off are required for an interior light update" });
        }
        const building = await storage.getHouseBundleBuilding(buildingId);
        if (!building || building.bundleId !== bundleId) {
          return res.status(404).json({ message: "Building not found" });
        }
        const effect = (building.interiorEffects ?? []).find(candidate => candidate.id === effectId);
        if (!effect || !isHouseInteriorLightEffectType(effect.type)) {
          return res.status(404).json({ message: "Light effect not found" });
        }
      }

      const playerLighting = await storage.updateUserHouseLighting(user.id, bundleId, {
        ...(hasOutdoorMode ? { outdoorMode } : {}),
        ...(hasInteriorToggle ? { buildingId, effectId, off } : {}),
      });
      if (!playerLighting) return res.status(404).json({ message: "Owned bundle not found" });
      return res.json({ playerLighting });
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

      const currentBundle = await storage.getActiveBundleWithBuildings(user.id);
      if (currentBundle?.id !== bundleId) {
        await storeAllHomeScene(user.id);
      }

      await storage.setActiveHouseBundle(user.id, bundleId);
      await ensureIncludedItemsGranted(user.id);
      await applyIncludedItemTemplates(user.id, bundleId);
      const bundle = await storage.getActiveBundleWithBuildings(user.id);
      return res.json(bundle);
    } catch (err: any) {
      console.error("[HomeBundle] activation failed", {
        userId: (req.user as any)?.id ?? null,
        bundleId: (req.params as any)?.bundleId ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/deactivate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      await storeAllHomeScene(user.id);
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
      const { name, price, shopImageData, bgImageData, giftNotificationX, giftNotificationY, maxOutdoorPets, maxOutdoorDecor, exteriorEffects } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (price !== undefined) updates.price = price;
      if (shopImageData) updates.shopImageUrl = await processWorldImage(shopImageData, 1000);
      if (bgImageData) updates.bgImageUrl = await processWorldImage(bgImageData, 3000);
      if (giftNotificationX !== undefined) updates.giftNotificationX = giftNotificationX;
      if (giftNotificationY !== undefined) updates.giftNotificationY = giftNotificationY;
      if (maxOutdoorPets !== undefined) updates.maxOutdoorPets = Math.max(0, Number(maxOutdoorPets));
      if (maxOutdoorDecor !== undefined) updates.maxOutdoorDecor = Math.max(0, Number(maxOutdoorDecor));
      if (exteriorEffects !== undefined) {
        if (!Array.isArray(exteriorEffects)) return res.status(400).json({ message: "exteriorEffects must be an array" });
        updates.exteriorEffects = sanitizeHouseOutdoorEffects(exteriorEffects);
      }
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

  // ── Home Bundle included Decor / Objects ───────────────────────────────────
  const enrichIncludedItem = async (row: typeof houseBundleIncludedItems.$inferSelect) => {
    if (row.itemType === "decor") {
      const [item] = await db.select({
        id: homeDecorItems.id,
        name: homeDecorItems.name,
        imageUrl: homeDecorItems.imageUrl,
        homeSceneSize: homeDecorItems.homeSceneSize,
      }).from(homeDecorItems).where(eq(homeDecorItems.id, row.itemId)).limit(1);
      return item ? { ...row, item: { ...item, type: "decor" as const } } : null;
    }

    const [item] = await db.select({
      id: shopItems.id,
      name: shopItems.name,
      imageUrl: shopItems.imageUrl,
      homeSceneSize: shopItems.homeSceneSize,
    }).from(shopItems).where(and(eq(shopItems.id, row.itemId), eq(shopItems.type, "object"))).limit(1);
    return item ? { ...row, item: { ...item, type: "object" as const } } : null;
  };

  app.get("/api/admin/house-bundles/:bundleId/included-items", isAdmin, async (req, res) => {
    try {
      const rows = await db.select().from(houseBundleIncludedItems)
        .where(and(
          eq(houseBundleIncludedItems.bundleId, req.params.bundleId as string),
          eq(houseBundleIncludedItems.active, true),
        ))
        .orderBy(asc(houseBundleIncludedItems.createdAt), asc(houseBundleIncludedItems.id));
      const detailed = (await Promise.all(rows.map(enrichIncludedItem))).filter(Boolean);
      return res.json(detailed);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundles/:bundleId/included-items", isAdmin, async (req, res) => {
    try {
      const bundleId = req.params.bundleId as string;
      const { itemType, itemId, buildingId } = req.body ?? {};
      if (itemType !== "decor" && itemType !== "object") {
        return res.status(400).json({ message: "itemType must be decor or object" });
      }
      if (typeof itemId !== "string" || !itemId) {
        return res.status(400).json({ message: "itemId is required" });
      }

      const [bundle] = await db.select({ id: houseBundlesTable.id }).from(houseBundlesTable)
        .where(eq(houseBundlesTable.id, bundleId)).limit(1);
      if (!bundle) return res.status(404).json({ message: "Bundle not found" });

      const safeBuildingId = typeof buildingId === "string" && buildingId ? buildingId : null;
      if (safeBuildingId) {
        const building = await storage.getHouseBundleBuilding(safeBuildingId);
        if (!building || building.bundleId !== bundleId) {
          return res.status(404).json({ message: "Building not found in this bundle" });
        }
      }

      if (itemType === "decor") {
        const [item] = await db.select({ id: homeDecorItems.id, homeSceneSize: homeDecorItems.homeSceneSize }).from(homeDecorItems)
          .where(eq(homeDecorItems.id, itemId)).limit(1);
        if (!item) return res.status(404).json({ message: "Decor item not found" });
      } else {
        const [item] = await db.select({ id: shopItems.id, homeSceneSize: shopItems.homeSceneSize }).from(shopItems)
          .where(and(eq(shopItems.id, itemId), eq(shopItems.type, "object"))).limit(1);
        if (!item) return res.status(404).json({ message: "Object not found" });
      }

      const [catalogPlacement] = itemType === "decor"
        ? await db.select({ homeSceneSize: homeDecorItems.homeSceneSize }).from(homeDecorItems).where(eq(homeDecorItems.id, itemId)).limit(1)
        : await db.select({ homeSceneSize: shopItems.homeSceneSize }).from(shopItems).where(and(eq(shopItems.id, itemId), eq(shopItems.type, "object"))).limit(1);

      const [existing] = await db.select().from(houseBundleIncludedItems)
        .where(and(
          eq(houseBundleIncludedItems.bundleId, bundleId),
          eq(houseBundleIncludedItems.itemType, itemType),
          eq(houseBundleIncludedItems.itemId, itemId),
        ))
        .limit(1);

      if (existing?.active) {
        return res.status(409).json({ message: "This item is already included in the Home Bundle" });
      }

      const [row] = existing
        ? await db.update(houseBundleIncludedItems).set({
            active: true,
            buildingId: safeBuildingId,
            quantity: 1,
          }).where(eq(houseBundleIncludedItems.id, existing.id)).returning()
        : await db.insert(houseBundleIncludedItems).values({
            bundleId,
            buildingId: safeBuildingId,
            itemType,
            itemId,
            quantity: 1,
            xPct: 0.5,
            yPct: 0.52,
            size: Math.max(60, Math.min(500, catalogPlacement?.homeSceneSize ?? 250)),
            flipped: false,
          }).returning();

      const detailed = row ? await enrichIncludedItem(row) : null;
      return res.status(existing ? 200 : 201).json(detailed ?? row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/house-bundle-included-items/:id", isAdmin, async (req, res) => {
    try {
      const updates: Partial<typeof houseBundleIncludedItems.$inferInsert> = {};
      if (req.body?.quantity !== undefined) updates.quantity = sanitizeHouseBundleIncludedItemQuantity(req.body.quantity);
      if (req.body?.xPct !== undefined) {
        const value = Number(req.body.xPct);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "xPct must be a number" });
        updates.xPct = Math.max(0.02, Math.min(0.98, value));
      }
      if (req.body?.yPct !== undefined) {
        const value = Number(req.body.yPct);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "yPct must be a number" });
        updates.yPct = Math.max(0.02, Math.min(0.98, value));
      }
      if (req.body?.size !== undefined) {
        const value = Number(req.body.size);
        if (!Number.isFinite(value)) return res.status(400).json({ message: "size must be a number" });
        updates.size = Math.max(60, Math.min(500, Math.round(value)));
      }
      if (req.body?.flipped !== undefined) {
        if (typeof req.body.flipped !== "boolean") return res.status(400).json({ message: "flipped must be boolean" });
        updates.flipped = req.body.flipped;
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "An included item update is required" });
      }
      const [row] = await db.update(houseBundleIncludedItems)
        .set(updates)
        .where(and(
          eq(houseBundleIncludedItems.id, req.params.id as string),
          eq(houseBundleIncludedItems.active, true),
        ))
        .returning();
      if (!row) return res.status(404).json({ message: "Included item not found" });
      return res.json((await enrichIncludedItem(row)) ?? row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/house-bundle-included-items/:id", isAdmin, async (req, res) => {
    try {
      const [row] = await db.update(houseBundleIncludedItems)
        .set({ active: false })
        .where(and(
          eq(houseBundleIncludedItems.id, req.params.id as string),
          eq(houseBundleIncludedItems.active, true),
        ))
        .returning({ id: houseBundleIncludedItems.id });
      if (!row) return res.status(404).json({ message: "Included item not found" });
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
      if (buildingType !== undefined && !isHouseBuildingType(buildingType)) {
        return res.status(400).json({ message: "buildingType must be building or mailbox" });
      }
      const type = buildingType ?? "building";
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
        interiorEffects,
        interiorDarkness,
      } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (posX !== undefined) updates.posX = posX;
      if (posY !== undefined) updates.posY = posY;
      if (width !== undefined) updates.width = Math.max(20, Math.min(600, Number(width)));
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
      if (interiorEffects !== undefined) {
        if (!Array.isArray(interiorEffects)) return res.status(400).json({ message: "interiorEffects must be an array" });
        updates.interiorEffects = sanitizeHouseInteriorEffects(interiorEffects);
      }
      if (interiorDarkness !== undefined) updates.interiorDarkness = sanitizeHouseInteriorDarkness(interiorDarkness);
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
        interiorEffects: source.interiorEffects,
        interiorDarkness: source.interiorDarkness,
        buildingType: source.buildingType,
        size: source.size,
      });
      return res.status(201).json(duplicate);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── House Bundle shop stock ────────────────────────────────────────────────
  app.get("/api/admin/location/:locationId/shop-bundles", isAdmin, async (req, res) => {
    try {
      const rows = await storage.getLocationHouseBundles(req.params.locationId as string);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/location/:locationId/assign-bundle/:bundleId", isAdmin, async (req, res) => {
    try {
      const row = await storage.addBundleToShop(
        req.params.locationId as string,
        req.params.bundleId as string,
      );
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-bundle/:bundleId", isAdmin, async (req, res) => {
    try {
      await storage.removeBundleFromShop(
        req.params.locationId as string,
        req.params.bundleId as string,
      );
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/locations/:locationId/shop-bundles", isAuthenticated, async (req, res) => {
    try {
      const rows = await storage.getLocationHouseBundles(req.params.locationId as string);
      return res.json(rows.map((row) => row.bundle));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

}
