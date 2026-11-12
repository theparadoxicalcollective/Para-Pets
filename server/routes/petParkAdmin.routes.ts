import type { Express, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, ilike, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { isParkGroundLevel, isParkGroundTheme, parkGroundSize } from "@shared/petParkGround";
import { petParkBuildings, petParkDeposits, petParkSceneItems, petParkSettings, shopItems } from "@shared/schema";
import { HOUSE_INTERIOR_DARKNESS_MIN, HOUSE_INTERIOR_DARKNESS_MAX } from "@shared/housing";
import { sanitizeHouseInteriorEffects } from "@shared/housing";
import { sanitizeParkInteriorEffects, isPetAccessibleParkRoom } from "@shared/petParkRooms";
import { isValidPetParkBuildingCapacity, PET_PARK_BUILDING_CAPACITY_MAX, PET_PARK_BUILDING_CAPACITY_MIN } from "@shared/petParkBuildingCapacity";
import { isParkEffect, isValidParkLightColor } from "@shared/petParkEffects";
import { isValidParkDecorEffects, type ParkDecorEffect } from "@shared/petParkDecorEffects";
import { isPaintableParkTerrainDetail } from "@shared/petParkTerrainDetails";
import type { db as database } from "../db";
import { isDecorSurface } from "@shared/decorSurface";
import { validParkShopPlacements } from "@shared/petParkShopPlacements";

type ParkKind = "decor" | "sleep_spot" | "effect" | "terrain";
function isKind(value: unknown): value is ParkKind {
  return value === "decor" || value === "sleep_spot" || value === "effect" || value === "terrain";
}
function validPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function validSize(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 1000;
}
function validLayer(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= -10000 && (value as number) <= 10000;
}
function decorAppearanceWhere(source: { id: string; appearanceGroupId: string | null }) {
  return and(eq(petParkSceneItems.kind, "decor"),
    source.appearanceGroupId
      ? eq(petParkSceneItems.appearanceGroupId, source.appearanceGroupId)
      : eq(petParkSceneItems.id, source.id));
}
function validImageUpload(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= 8_000_000;
}

export function registerPetParkAdminRoutes(
  app: Express,
  { db, isAdmin, processWorldImage }: {
    db: typeof database;
    isAdmin: RequestHandler;
    processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
  },
): void {
  // Bounded catalog lookup for the existing shop items, only while the admin
  // is curating a building. Never load the entire catalog into the park scene.
  app.get("/api/admin/pet-park/shop-catalog", isAdmin, async (req, res) => {
    const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 75) : "";
    const type = typeof req.query.type === "string" ? req.query.type.trim().slice(0, 40) : "";
    try {
      const items = await db.select({
        id: shopItems.id, name: shopItems.name, type: shopItems.type,
        imageUrl: shopItems.imageUrl, eggImageUrl: shopItems.eggImageUrl,
        hatchedImageUrl: shopItems.hatchedImageUrl, price: shopItems.price,
      }).from(shopItems).where(and(
        // Garden fruit is harvest/market-only: never list an item that the
        // existing coin shop transaction must refuse to sell.
        sql`${shopItems.type} <> 'garden_fruit'`,
        search ? ilike(shopItems.name, "%" + search + "%") : undefined,
        type && type !== "all" ? eq(shopItems.type, type) : undefined,
      )).orderBy(asc(shopItems.name)).limit(100);
      return res.json(items);
    } catch (error) {
      console.error("[pet-park] shop item catalog failed", error);
      return res.status(500).json({ message: "Unable to search shop items" });
    }
  });

  // Draft assets are admin-only; players cannot see unpublished park content.
  app.get("/api/admin/pet-park", isAdmin, async (_req, res) => {
    try {
      const [settings] = await db.select().from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const items = await db.select().from(petParkSceneItems).orderBy(asc(petParkSceneItems.layer));
      const buildings = await db.select().from(petParkBuildings).orderBy(asc(petParkBuildings.layer));
      return res.json({ settings: settings ?? { enabledForPlayers: false, enabledForModerators: false, backgroundUrl: null }, items, buildings });
    } catch (error) {
      console.error("[pet-park] admin read failed", error);
      return res.status(500).json({ message: "Unable to load Pet Park" });
    }
  });


  app.put("/api/admin/pet-park/publishing", isAdmin, async (req, res) => {
    const { enabledForPlayers, enabledForModerators, coinsPerHour, essencePerHour, petXpPerHour } = req.body ?? {};
    if (typeof enabledForModerators !== "boolean") return res.status(400).json({ message: "Invalid moderator park availability" });
    const validRate = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10000;
    if (typeof enabledForPlayers !== "boolean" || !validRate(coinsPerHour) ||
        !validRate(essencePerHour) || !validRate(petXpPerHour)) {
      return res.status(400).json({ message: "Invalid park settings or reward rates" });
    }
    if (enabledForPlayers && (coinsPerHour + essencePerHour + petXpPerHour) === 0) {
      return res.status(400).json({ message: "Set at least one reward rate before opening" });
    }
    try {
      const updated = await db.transaction(async tx => {
        const [current] = await tx.select().from(petParkSettings)
          .where(eq(petParkSettings.id, "main")).for("update");
        if (!current) throw new Error("Pet Park settings not initialized");
        const now = new Date();
        const [activeDeposit] = await tx.select({ id: petParkDeposits.id }).from(petParkDeposits)
          .where(isNull(petParkDeposits.withdrawnAt)).limit(1);
        if (activeDeposit && (coinsPerHour !== current.coinsPerHour ||
            essencePerHour !== current.essencePerHour || petXpPerHour !== current.petXpPerHour)) {
          return { conflict: true as const };
        }
        if (current.enabledForPlayers !== enabledForPlayers) {
          if (enabledForPlayers) {
            await tx.update(petParkDeposits).set({
              pausedDurationMs: sql`${petParkDeposits.pausedDurationMs} + COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamp - ${petParkDeposits.pausedAt})) * 1000)::integer, 0)`,
              pausedAt: null,
            }).where(isNull(petParkDeposits.withdrawnAt));
          } else {
            await tx.update(petParkDeposits).set({ pausedAt: now })
              .where(isNull(petParkDeposits.withdrawnAt));
          }
        }
        const [settings] = await tx.update(petParkSettings).set({
          enabledForPlayers, enabledForModerators, coinsPerHour, essencePerHour, petXpPerHour, updatedAt: now,
        }).where(eq(petParkSettings.id, "main")).returning();
        return settings;
      });
      if ("conflict" in updated) return res.status(409).json({ message: "Retrieve all deposited pets before changing earning rates" });
      return res.json(updated);
    } catch (error) {
      console.error("[pet-park] publishing failed", error);
      return res.status(500).json({ message: "Unable to update Pet Park availability" });
    }
  });

  // Expand the real grass world. Reposition all saved objects and public pet
  // coordinates in ONE transaction so their center-anchored locations stay put.
  app.patch("/api/admin/pet-park/ground", isAdmin, async (req, res) => {
    const { groundLevel } = req.body ?? {};
    if (!isParkGroundLevel(groundLevel)) {
      return res.status(400).json({ message: "Choose a valid ground expansion level" });
    }
    try {
      const result = await db.transaction(async tx => {
        const [current] = await tx.select().from(petParkSettings)
          .where(eq(petParkSettings.id, "main")).for("update");
        if (!current) return { status: 404 as const };
        const oldLevel = current.groundLevel;
        if (groundLevel !== oldLevel + 1) {
          return { status: 409 as const };
        }
        const oldSize = parkGroundSize(oldLevel);
        const nextSize = parkGroundSize(groundLevel);
        const ratioX = oldSize.width / nextSize.width;
        const ratioY = oldSize.height / nextSize.height;
        await tx.update(petParkSceneItems).set({
          xPct: sql`0.5 + (${petParkSceneItems.xPct} - 0.5) * ${ratioX}`,
          yPct: sql`0.5 + (${petParkSceneItems.yPct} - 0.5) * ${ratioY}`,
        });
        await tx.update(petParkBuildings).set({
          xPct: sql`0.5 + (${petParkBuildings.xPct} - 0.5) * ${ratioX}`,
          yPct: sql`0.5 + (${petParkBuildings.yPct} - 0.5) * ${ratioY}`,
        });
        await tx.update(petParkDeposits).set({
          parkXPct: sql`0.5 + (${petParkDeposits.parkXPct} - 0.5) * ${ratioX}`,
          parkYPct: sql`0.5 + (${petParkDeposits.parkYPct} - 0.5) * ${ratioY}`,
        }).where(and(isNotNull(petParkDeposits.parkXPct), isNotNull(petParkDeposits.parkYPct)));
        const [updated] = await tx.update(petParkSettings)
          .set({ groundLevel, updatedAt: new Date() })
          .where(eq(petParkSettings.id, "main")).returning();
        return { status: 200 as const, groundLevel: updated.groundLevel };
      });
      if (result.status !== 200) return res.status(result.status).json({
        message: result.status === 409 ? "Park size changed; reload before expanding again" : "Pet Park settings not found",
      });
      return res.json({ groundLevel: result.groundLevel });
    } catch (error) {
      console.error("[pet-park] expanding ground failed", error);
      return res.status(500).json({ message: "Unable to expand park ground" });
    }
  });

  // Separate from ground expansion: changing scenery must never transform
  // authored object/pet positions or touch publishing and reward settings.
  app.patch("/api/admin/pet-park/ground-theme", isAdmin, async (req, res) => {
    const { groundTheme } = req.body ?? {};
    if (!isParkGroundTheme(groundTheme)) {
      return res.status(400).json({ message: "Choose a valid Pet Park ground style" });
    }
    try {
      const [saved] = await db.update(petParkSettings).set({ groundTheme, updatedAt: new Date() })
        .where(eq(petParkSettings.id, "main")).returning({ groundTheme: petParkSettings.groundTheme });
      if (!saved) return res.status(404).json({ message: "Pet Park settings not found" });
      return res.json(saved);
    } catch (error) {
      console.error("[pet-park] ground style update failed", error);
      return res.status(500).json({ message: "Unable to change Pet Park ground" });
    }
  });

  app.post("/api/admin/pet-park/buildings", isAdmin, async (req, res) => {
    const { name, imageData, interiorImageData, nightInteriorImageData = null, xPct = 0.5, yPct = 0.5, size = 300, flipped = false, layer = 0, maxPets = PET_PARK_BUILDING_CAPACITY_MIN, isShop = false, interiorDarkness = 35 } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80 ||
        typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 8_000_000 ||
        (interiorImageData != null && (typeof interiorImageData !== "string" || !interiorImageData.startsWith("data:image/") || interiorImageData.length > 12_000_000)) ||
        (nightInteriorImageData != null && (typeof nightInteriorImageData !== "string" || !nightInteriorImageData.startsWith("data:image/") || nightInteriorImageData.length > 12_000_000)) ||
        !validPosition(xPct) || !validPosition(yPct) || !validSize(size) || typeof flipped !== "boolean" || !validLayer(layer) ||
        !isValidPetParkBuildingCapacity(maxPets) || typeof isShop !== "boolean" ||
        !Number.isInteger(interiorDarkness) || interiorDarkness < HOUSE_INTERIOR_DARKNESS_MIN || interiorDarkness > HOUSE_INTERIOR_DARKNESS_MAX) {
      return res.status(400).json({ message: `Provide a name, exterior image, valid placement and a pet capacity from ${PET_PARK_BUILDING_CAPACITY_MIN} to ${PET_PARK_BUILDING_CAPACITY_MAX}` });
    }
    try {
      const imageUrl = await processWorldImage(imageData, 1200);
      const interiorImageUrl = interiorImageData ? await processWorldImage(interiorImageData, 2000) : null;
      const nightInteriorImageUrl = nightInteriorImageData ? await processWorldImage(nightInteriorImageData, 2000) : null;
      const [building] = await db.insert(petParkBuildings).values({
        name: name.trim(), imageUrl, interiorImageUrl, nightInteriorImageUrl, xPct, yPct, size, flipped, layer, maxPets, isShop, shopItemIds: [], interiorDarkness, interiorEffects: [], exteriorEffects: [],
      }).returning();
      return res.status(201).json(building);
    } catch (error) {
      console.error("[pet-park] building create failed", error);
      return res.status(500).json({ message: "Unable to create Pet Park building" });
    }
  });

  app.patch("/api/admin/pet-park/buildings/:id", isAdmin, async (req, res) => {
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) return res.status(400).json({ message: "Building name must be 1–80 characters" });
      updates.name = body.name.trim();
    }
    if (body.imageData !== undefined) {
      if (typeof body.imageData !== "string" || !body.imageData.startsWith("data:image/") || body.imageData.length > 8_000_000) return res.status(400).json({ message: "Valid exterior image required" });
      try { updates.imageUrl = await processWorldImage(body.imageData, 1200); } catch { return res.status(400).json({ message: "Unable to process exterior image" }); }
    }
    if (body.interiorImageData !== undefined) {
      if (body.interiorImageData !== null && (typeof body.interiorImageData !== "string" || !body.interiorImageData.startsWith("data:image/") || body.interiorImageData.length > 12_000_000)) return res.status(400).json({ message: "Valid interior image required" });
      try { updates.interiorImageUrl = body.interiorImageData ? await processWorldImage(body.interiorImageData, 2000) : null; } catch { return res.status(400).json({ message: "Unable to process interior image" }); }
    }
    if (body.nightInteriorImageData !== undefined) {
      if (body.nightInteriorImageData !== null &&
          (typeof body.nightInteriorImageData !== "string" ||
            !body.nightInteriorImageData.startsWith("data:image/") ||
            body.nightInteriorImageData.length > 12_000_000))
        return res.status(400).json({ message: "Choose a valid nighttime interior image or remove it" });
      try {
        updates.nightInteriorImageUrl = body.nightInteriorImageData
          ? await processWorldImage(body.nightInteriorImageData, 2000) : null;
      } catch {
        return res.status(400).json({ message: "Unable to process nighttime interior image" });
      }
    }
    if (body.interiorDarkness !== undefined) {
      if (!Number.isInteger(body.interiorDarkness) || body.interiorDarkness < HOUSE_INTERIOR_DARKNESS_MIN ||
          body.interiorDarkness > HOUSE_INTERIOR_DARKNESS_MAX) {
        return res.status(400).json({ message: "Interior darkness must be between 0 and 90 percent" });
      }
      updates.interiorDarkness = body.interiorDarkness;
    }
    if (body.interiorNightDarkness !== undefined) {
      if (!Number.isInteger(body.interiorNightDarkness) ||
          body.interiorNightDarkness < HOUSE_INTERIOR_DARKNESS_MIN ||
          body.interiorNightDarkness > HOUSE_INTERIOR_DARKNESS_MAX)
        return res.status(400).json({ message: "Peak night darkness must be between 0 and 90 percent" });
      updates.interiorNightDarkness = body.interiorNightDarkness;
    }
    if (body.isShop !== undefined) {
      if (typeof body.isShop !== "boolean") return res.status(400).json({ message: "Is Shop must be on or off" });
      updates.isShop = body.isShop;
    }
    if (body.shopItemPlacements !== undefined) {
      if (!validParkShopPlacements(body.shopItemPlacements))
        return res.status(400).json({ message: "Use up to 80 distinct image-relative merchandise positions and valid item sizes" });
      updates.shopItemPlacements = body.shopItemPlacements;
    }
    if (body.shopItemIds !== undefined) {
      const ids = body.shopItemIds;
      if (!Array.isArray(ids) || ids.length > 80 ||
          ids.some((id: unknown) => typeof id !== "string" || id.length < 1 || id.length > 100) ||
          new Set(ids).size !== ids.length) {
        return res.status(400).json({ message: "Select up to 80 unique, valid shop items" });
      }
      updates.shopItemIds = ids;
    }
    if (body.maxPets !== undefined) {
      if (!isValidPetParkBuildingCapacity(body.maxPets)) return res.status(400).json({ message: `Building capacity must be from ${PET_PARK_BUILDING_CAPACITY_MIN} to ${PET_PARK_BUILDING_CAPACITY_MAX}` });
      updates.maxPets = body.maxPets;
    }
    if (body.exteriorEffects !== undefined) {
      if (!isValidParkDecorEffects(body.exteriorEffects))
        return res.status(400).json({ message: "Invalid building facade effects" });
      updates.exteriorEffects = body.exteriorEffects;
    }
    if (body.interiorEffects !== undefined) {
      if (!Array.isArray(body.interiorEffects) || body.interiorEffects.length > 20)
        return res.status(400).json({ message: "Choose up to 20 valid interior effects" });
      updates.interiorEffects = body.interiorEffects;
    }
    if (body.roomImageData !== undefined && (typeof body.roomImageData !== "string" ||
        !body.roomImageData.startsWith("data:image/") || body.roomImageData.length > 12_000_000 ||
        !Array.isArray(body.interiorEffects) || typeof body.roomEffectId !== "string")) {
      return res.status(400).json({ message: "Save a selected room with a valid image" });
    }
    let uploadedRoomUrl: string | null = null;
    if (body.roomImageData !== undefined) {
      try { uploadedRoomUrl = await processWorldImage(body.roomImageData, 2000); }
      catch { return res.status(400).json({ message: "Unable to process room image" }); }
    }
    for (const key of ["xPct", "yPct", "size", "flipped", "layer"] as const) {
      if (body[key] === undefined) continue;
      const valid = key === "xPct" || key === "yPct" ? validPosition(body[key]) : key === "size" ? validSize(body[key]) : key === "flipped" ? typeof body[key] === "boolean" : validLayer(body[key]);
      if (!valid) return res.status(400).json({ message: "Invalid building placement" });
      updates[key] = body[key];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: "No valid building changes provided" });
    if (updates.shopItemIds !== undefined && (updates.shopItemIds as string[]).length) {
      try {
        const ids = updates.shopItemIds as string[];
        const found = await db.select({ id: shopItems.id, type: shopItems.type })
          .from(shopItems).where(inArray(shopItems.id, ids));
        if (found.length !== ids.length) return res.status(400).json({ message: "A selected shop item no longer exists" });
        if (found.some(item => item.type === "garden_fruit"))
          return res.status(400).json({ message: "Harvested fruit cannot be stocked in coin shops" });
      } catch (error) {
        console.error("[pet-park] shop catalog validation failed", error);
        return res.status(500).json({ message: "Could not validate shop items" });
      }
    }
    try {
      if (updates.maxPets !== undefined || updates.interiorEffects !== undefined ||
          updates.isShop === true || updates.shopItemPlacements !== undefined ||
          updates.shopItemIds !== undefined) {
        // Room changes and pet placements serialize through the same building lock.
        // Never delete, shrink or convert a room that currently contains pets.
        const result = await db.transaction(async tx => {
          const [existing] = await tx.select().from(petParkBuildings)
            .where(eq(petParkBuildings.id, String(req.params.id))).for("update");
          if (!existing) return { status: 404 as const };
          const currentIds = updates.shopItemIds !== undefined
            ? updates.shopItemIds as string[] : existing.shopItemIds ?? [];
          const newPlacements = updates.shopItemPlacements !== undefined
            ? updates.shopItemPlacements as import("@shared/petParkShopPlacements").ParkShopPlacement[]
            : existing.shopItemPlacements ?? [];
          if (newPlacements.some(item => !currentIds.includes(item.itemId)))
            return { status: 400 as const, message: "Placed shop artwork must belong to the shop catalog" };
          if (updates.shopItemPlacements === undefined && updates.shopItemIds !== undefined)
            updates.shopItemPlacements = newPlacements.filter(item => currentIds.includes(item.itemId));
          const occupants = await tx.select({ id: petParkDeposits.id, roomEffectId: petParkDeposits.roomEffectId })
            .from(petParkDeposits)
            .where(and(eq(petParkDeposits.buildingId, existing.id), isNull(petParkDeposits.withdrawnAt)));
          if (updates.maxPets !== undefined && updates.isShop !== true && !existing.isShop &&
              occupants.length > (updates.maxPets as number))
            return { status: 409 as const, message: `This building has ${occupants.length} active pets. Move pets outside before lowering capacity.` };
          if (updates.interiorEffects !== undefined) {
            let proposed = sanitizeParkInteriorEffects(body.interiorEffects, existing.interiorEffects);
            if (uploadedRoomUrl !== null) {
              const id = String(body.roomEffectId);
              const room = proposed.find(effect => effect.id === id);
              if (!room || room.type !== "room")
                return { status: 400 as const, message: "Select a valid room before uploading artwork" };
              proposed = proposed.map(effect => effect.id === id && effect.type === "room"
                ? { ...effect, imageUrl: uploadedRoomUrl } : effect);
            }
            // Active occupants cannot be orphaned by deleting a full-page
            // room, changing it into a popup, or lowering its pet limit.
            const counts = new Map<string, number>();
            for (const occupant of occupants) if (occupant.roomEffectId) {
              counts.set(occupant.roomEffectId, (counts.get(occupant.roomEffectId) ?? 0) + 1);
            }
            for (const [roomId, count] of counts) {
              const room = proposed.find(effect => effect.id === roomId);
              if (!isPetAccessibleParkRoom(room) || count > room.maxPets)
                return { status: 409 as const, message: "Move pets out before changing an occupied room or its capacity" };
            }
            updates.interiorEffects = proposed;
          }
          if (updates.isShop === true) {
            // A newly opened shop cannot keep active indoor pets; return them
            // to their earning ovals, preserving their deposit and checkpoint.
            await tx.update(petParkDeposits).set({
              buildingId: null, roomEffectId: null, showInPark: false,
              parkXPct: null, parkYPct: null, pose: "idle",
            }).where(and(eq(petParkDeposits.buildingId, existing.id),
              isNull(petParkDeposits.withdrawnAt)));
          }
          const [building] = await tx.update(petParkBuildings).set(updates)
            .where(eq(petParkBuildings.id, existing.id)).returning();
          return { status: 200 as const, building };
        });
        if (result.status === 404) return res.status(404).json({ message: "Building not found" });
        if (result.status === 400) return res.status(400).json({ message: result.message });
        if (result.status === 409) return res.status(409).json({ message: result.message });
        return res.json(result.building);
      }
      const [building] = await db.update(petParkBuildings).set(updates).where(eq(petParkBuildings.id, String(req.params.id))).returning();
      return building ? res.json(building) : res.status(404).json({ message: "Building not found" });
    } catch (error) {
      console.error("[pet-park] building update failed", error);
      return res.status(500).json({ message: "Unable to update Pet Park building" });
    }
  });

  app.delete("/api/admin/pet-park/buildings/:id", isAdmin, async (req, res) => {
    try {
      const buildingId = String(req.params.id);
      const deleted = await db.transaction(async tx => {
        const [building] = await tx.select({ id: petParkBuildings.id }).from(petParkBuildings)
          .where(eq(petParkBuildings.id, buildingId)).for("update");
        if (!building) return false;
        // Deleting a building clears legacy indoor placement without releasing
        // or claiming any deposit. Otherwise ON DELETE SET NULL could make a
        // previously indoor pet public without its owner dragging it outdoors.
        await tx.update(petParkDeposits).set({
          showInPark: false, buildingId: null, roomEffectId: null,
          parkXPct: null, parkYPct: null, pose: "idle",
        }).where(and(eq(petParkDeposits.buildingId, buildingId), isNull(petParkDeposits.withdrawnAt)));
        await tx.delete(petParkBuildings).where(eq(petParkBuildings.id, buildingId));
        return true;
      });
      return deleted ? res.json({ deleted: true }) : res.status(404).json({ message: "Building not found" });
    } catch (error) {
      console.error("[pet-park] building delete failed", error);
      return res.status(500).json({ message: "Unable to delete Pet Park building" });
    }
  });

  // A brush stroke saves existing terrain item records in one atomic INSERT.
  // No new terrain storage, per-pointer network writes or payout mutations.
  // Clear only saved terrain stamps; leave uploaded decor, effects, buildings,
  // player deposits, ground size and reward settings untouched.
  app.delete("/api/admin/pet-park/terrain", isAdmin, async (_req, res) => {
    try {
      const removed = await db.delete(petParkSceneItems)
        .where(eq(petParkSceneItems.kind, "terrain"))
        .returning({ id: petParkSceneItems.id });
      return res.json({ deleted: removed.length });
    } catch (error) {
      console.error("[pet-park] clear terrain failed", error);
      return res.status(500).json({ message: "Unable to clear Pet Park terrain" });
    }
  });

  app.post("/api/admin/pet-park/terrain-strokes", isAdmin, async (req, res) => {
    const { type, size, points } = req.body ?? {};
    if (!isPaintableParkTerrainDetail(type) || !validSize(size) ||
        !Array.isArray(points) || points.length < 1 || points.length > 60 ||
        !points.every(point => point && validPosition(point.xPct) && validPosition(point.yPct))) {
      return res.status(400).json({ message: "Invalid terrain brush stroke (1–60 points required)" });
    }
    try {
      const created = await db.insert(petParkSceneItems).values(points.map(point => ({
        kind: "terrain", effectType: type, imageUrl: null,
        xPct: point.xPct, yPct: point.yPct, size, flipped: false, layer: 0,
      }))).returning();
      return res.status(201).json({ items: created });
    } catch (error) {
      console.error("[pet-park] brush save failed", error);
      return res.status(500).json({ message: "Could not save terrain stroke" });
    }
  });

  app.post("/api/admin/pet-park/items", isAdmin, async (req, res) => {
    const { kind, effectType, effectColor = null, imageData, tapImageData = null, decorEffects = [], xPct, yPct, size, flipped, layer, isWaterSource = false, decorSurface = "barrier" } = req.body ?? {};
    if (!isKind(kind) || !validPosition(xPct) || !validPosition(yPct) ||
        !validSize(size) || typeof flipped !== "boolean" || !validLayer(layer) ||
        (imageData != null && (typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 8_000_000)) ||
        (tapImageData != null && (typeof tapImageData !== "string" || !tapImageData.startsWith("data:image/") || tapImageData.length > 8_000_000))) {
      return res.status(400).json({ message: "Invalid Pet Park item" });
    }
    if (typeof isWaterSource !== "boolean" || (kind !== "decor" && isWaterSource))
      return res.status(400).json({ message: "Only decorations can be marked as water sources" });
    if (!isDecorSurface(decorSurface) || (kind !== "decor" && decorSurface !== "barrier") ||
        (isWaterSource && decorSurface !== "barrier"))
      return res.status(400).json({ message: "Choose one valid decoration behavior" });
    if (kind === "decor" && !imageData) return res.status(400).json({ message: "Decor requires an image" });
    if (!isValidParkDecorEffects(decorEffects) || (kind !== "decor" && decorEffects.length))
      return res.status(400).json({ message: "Choose valid decorative effects" });
    if (kind !== "decor" && tapImageData != null) return res.status(400).json({ message: "Only decorations support Tap Images" });
    if (kind === "effect" && !isParkEffect(effectType)) return res.status(400).json({ message: "Choose a supported outdoor or water effect" });
    if (kind === "effect" && effectType === "colored_light"
      ? !isValidParkLightColor(effectColor)
      : kind === "effect" && effectType === "lamp_light"
        ? effectColor != null && !isValidParkLightColor(effectColor)
        : effectColor != null)
      return res.status(400).json({ message: "Choose a valid colored light orb color" });
    if (kind === "terrain" && !isPaintableParkTerrainDetail(effectType)) return res.status(400).json({ message: "Choose a valid terrain detail" });
    if (kind === "terrain" && imageData != null) return res.status(400).json({ message: "Terrain details do not use uploaded images" });
    try {
      const imageUrl = imageData ? await processWorldImage(imageData, 1200) : null;
      const tapImageUrl = tapImageData ? await processWorldImage(tapImageData, 1200) : null;
      const [item] = await db.insert(petParkSceneItems)
        .values({ kind, effectType: kind === "effect" || kind === "terrain" ? effectType : null,
          effectColor: kind === "effect" && (effectType === "colored_light" || effectType === "lamp_light") ? effectColor : null,
          imageUrl, tapImageUrl,
          appearanceGroupId: kind === "decor" ? randomUUID() : null,
          decorEffects: kind === "decor" ? decorEffects : [],
          xPct: Number(xPct), yPct: Number(yPct), size: Number(size), flipped, layer: Number(layer),
          isWaterSource, decorSurface }).returning();
      return res.status(201).json(item);
    } catch (error) {
      console.error("[pet-park] item create failed", error);
      return res.status(500).json({ message: "Unable to add Pet Park item" });
    }
  });

  // Duplicate an existing decoration without reuploading or reprocessing its art.
  // New objects receive their own ID and remain editable through the existing
  // item placement route; only the saved server-side asset URL is reused.
  app.post("/api/admin/pet-park/items/:id/duplicate", isAdmin, async (req, res) => {
    const { xPct, yPct } = req.body ?? {};
    if (!validPosition(xPct) || !validPosition(yPct))
      return res.status(400).json({ message: "Choose a valid place for the duplicated decoration" });
    try {
      const [original] = await db.select().from(petParkSceneItems)
        .where(eq(petParkSceneItems.id, String(req.params.id)));
      if (!original) return res.status(404).json({ message: "Decoration not found" });
      if (original.kind !== "decor" || !original.imageUrl)
        return res.status(422).json({ message: "Only uploaded decor objects can be duplicated" });
      const [item] = await db.insert(petParkSceneItems)
        .values({ kind: "decor", imageUrl: original.imageUrl, tapImageUrl: original.tapImageUrl, effectType: null,
          appearanceGroupId: original.appearanceGroupId ?? original.id,
          decorEffects: original.decorEffects,
          isWaterSource: original.isWaterSource, decorSurface: original.decorSurface,
          xPct, yPct, size: original.size, flipped: original.flipped, layer: original.layer })
        .returning();
      return res.status(201).json(item);
    } catch (error) {
      console.error("[pet-park] decor duplication failed", error);
      return res.status(500).json({ message: "Unable to duplicate decoration" });
    }
  });

  // Changes to a decoration's visual identity apply to all actual copies.
  // Placement, size, flipped orientation, layer, and water-source designation
  // deliberately do NOT appear in this endpoint and remain per instance.
  app.patch("/api/admin/pet-park/items/:id/appearance", isAdmin, async (req, res) => {
    const body = req.body ?? {};
    const hasImage = Object.prototype.hasOwnProperty.call(body, "imageData");
    const hasTap = Object.prototype.hasOwnProperty.call(body, "tapImageData");
    const hasEffects = Object.prototype.hasOwnProperty.call(body, "decorEffects");
    if (!hasImage && !hasTap && !hasEffects)
      return res.status(400).json({ message: "Choose artwork or decorative effects to update" });
    if (hasImage && !validImageUpload(body.imageData))
      return res.status(400).json({ message: "Choose valid decoration artwork" });
    if (hasTap && body.tapImageData !== null && !validImageUpload(body.tapImageData))
      return res.status(400).json({ message: "Choose a valid Tap Image or remove it" });
    if (hasEffects && !isValidParkDecorEffects(body.decorEffects))
      return res.status(400).json({ message: "Choose supported decorative effects" });
    try {
      const [source] = await db.select().from(petParkSceneItems)
        .where(and(eq(petParkSceneItems.id, String(req.params.id)), eq(petParkSceneItems.kind, "decor")));
      if (!source || source.kind !== "decor") return res.status(404).json({ message: "Decoration not found" });
      const patch: { imageUrl?: string; tapImageUrl?: string | null; decorEffects?: ParkDecorEffect[] } = {};
      if (hasImage) patch.imageUrl = await processWorldImage(body.imageData, 1200);
      if (hasTap) patch.tapImageUrl = body.tapImageData
        ? await processWorldImage(body.tapImageData, 1200) : null;
      if (hasEffects) patch.decorEffects = body.decorEffects;
      const updated = await db.update(petParkSceneItems).set(patch)
        .where(decorAppearanceWhere(source)).returning();
      return res.json({ item: updated.find(item => item.id === source.id), updatedCount: updated.length });
    } catch (error) {
      console.error("[pet-park] linked decor appearance update failed", error);
      return res.status(500).json({ message: "Could not update decoration appearance" });
    }
  });

  // Edit the optional alternate image independently of placement and the
  // normal artwork. Null removes it without affecting water-source metadata.
  app.patch("/api/admin/pet-park/items/:id/tap-image", isAdmin, async (req, res) => {
    const imageData = req.body?.imageData;
    if (imageData !== null &&
        (typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 8_000_000)) {
      return res.status(400).json({ message: "Choose a valid Tap Image or remove it" });
    }
    try {
      // Don't process images for nonexistent or non-decor objects.
      const [original] = await db.select().from(petParkSceneItems)
        .where(and(eq(petParkSceneItems.id, String(req.params.id)), eq(petParkSceneItems.kind, "decor")));
      if (!original || original.kind !== "decor") return res.status(404).json({ message: "Decoration not found" });
      const tapImageUrl = imageData ? await processWorldImage(imageData, 1200) : null;
      const updated = await db.update(petParkSceneItems).set({ tapImageUrl })
        .where(decorAppearanceWhere(original)).returning();
      const selected = updated.find(item => item.id === original.id);
      return selected ? res.json(selected) : res.status(404).json({ message: "Decoration not found" });
    } catch (error) {
      console.error("[pet-park] tap image update failed", error);
      return res.status(500).json({ message: "Could not update Tap Image" });
    }
  });

  // A new single-choice editor uses this route; existing clients can continue
  // using /water-source. Surface roles remain independent for linked copies.
  app.patch("/api/admin/pet-park/items/:id/surface", isAdmin, async (req, res) => {
    const { decorSurface, isWaterSource } = req.body ?? {};
    if (!isDecorSurface(decorSurface) || typeof isWaterSource !== "boolean" ||
        (isWaterSource && decorSurface !== "barrier"))
      return res.status(400).json({ message: "Choose one decoration behavior" });
    try {
      const [item] = await db.update(petParkSceneItems).set({ decorSurface, isWaterSource })
        .where(and(eq(petParkSceneItems.id, String(req.params.id)), eq(petParkSceneItems.kind, "decor")))
        .returning();
      return item ? res.json(item) : res.status(404).json({ message: "Decoration not found" });
    } catch (error) {
      console.error("[pet-park] decoration behavior update failed", error);
      return res.status(500).json({ message: "Could not change decoration behavior" });
    }
  });

  // Keep the legacy water-source endpoint valid and mutually exclusive with
  // Grass/Ground. No saved terrain or player watering charges are changed.
  app.patch("/api/admin/pet-park/items/:id/water-source", isAdmin, async (req, res) => {
    const isWaterSource = req.body?.isWaterSource;
    if (typeof isWaterSource !== "boolean")
      return res.status(400).json({ message: "Water Source must be on or off" });
    try {
      const [item] = await db.update(petParkSceneItems).set(isWaterSource
        ? { isWaterSource, decorSurface: "barrier" as const } : { isWaterSource })
        .where(and(eq(petParkSceneItems.id, String(req.params.id)), eq(petParkSceneItems.kind, "decor")))
        .returning();
      return item ? res.json(item) : res.status(404).json({ message: "Decoration not found" });
    } catch (error) {
      console.error("[pet-park] water source update failed", error);
      return res.status(500).json({ message: "Could not change Water Source" });
    }
  });

  app.patch("/api/admin/pet-park/items/:id/color", isAdmin, async (req, res) => {
    if (!isValidParkLightColor(req.body?.effectColor))
      return res.status(400).json({ message: "Choose a valid colored light orb color" });
    try {
      const [item] = await db.update(petParkSceneItems)
        .set({ effectColor: req.body.effectColor })
        .where(and(eq(petParkSceneItems.id, String(req.params.id)),
          eq(petParkSceneItems.kind, "effect"),
          inArray(petParkSceneItems.effectType, ["lamp_light", "colored_light"]))).returning();
      return item ? res.json(item) : res.status(404).json({ message: "Colored light not found" });
    } catch (error) {
      console.error("[pet-park] effect color update failed", error);
      return res.status(500).json({ message: "Unable to update colored light" });
    }
  });

  app.patch("/api/admin/pet-park/items/:id", isAdmin, async (req, res) => {
    const { xPct, yPct, size, flipped, layer } = req.body ?? {};
    if (!validPosition(xPct) || !validPosition(yPct) || !validSize(size) ||
        typeof flipped !== "boolean" || !validLayer(layer)) {
      return res.status(400).json({ message: "Invalid placement" });
    }
    try {
      const [item] = await db.update(petParkSceneItems)
        .set({ xPct, yPct, size, flipped, layer })
        .where(eq(petParkSceneItems.id, String(req.params.id))).returning();
      return item ? res.json(item) : res.status(404).json({ message: "Item not found" });
    } catch (error) {
      console.error("[pet-park] placement update failed", error);
      return res.status(500).json({ message: "Unable to update placement" });
    }
  });

  app.delete("/api/admin/pet-park/items/:id", isAdmin, async (req, res) => {
    try {
      const [item] = await db.delete(petParkSceneItems)
        .where(eq(petParkSceneItems.id, String(req.params.id))).returning({ id: petParkSceneItems.id });
      return item ? res.json({ deleted: true }) : res.status(404).json({ message: "Item not found" });
    } catch (error) {
      console.error("[pet-park] item delete failed", error);
      return res.status(500).json({ message: "Unable to delete item" });
    }
  });
}
