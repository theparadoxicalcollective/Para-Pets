import type { Express, RequestHandler } from "express";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { isParkGroundLevel, isParkGroundTheme, parkGroundSize } from "@shared/petParkGround";
import { petParkBuildings, petParkDeposits, petParkSceneItems, petParkSettings } from "@shared/schema";
import { sanitizeHouseInteriorEffects } from "@shared/housing";
import { sanitizeParkInteriorEffects, isPetAccessibleParkRoom } from "@shared/petParkRooms";
import { isValidPetParkBuildingCapacity, PET_PARK_BUILDING_CAPACITY_MAX, PET_PARK_BUILDING_CAPACITY_MIN } from "@shared/petParkBuildingCapacity";
import { isParkEffect } from "@shared/petParkEffects";
import { isPaintableParkTerrainDetail } from "@shared/petParkTerrainDetails";
import type { db as database } from "../db";

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

export function registerPetParkAdminRoutes(
  app: Express,
  { db, isAdmin, processWorldImage }: {
    db: typeof database;
    isAdmin: RequestHandler;
    processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
  },
): void {
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
    const { name, imageData, interiorImageData, xPct = 0.5, yPct = 0.5, size = 120, flipped = false, layer = 0, maxPets = PET_PARK_BUILDING_CAPACITY_MIN } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80 ||
        typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 8_000_000 ||
        (interiorImageData != null && (typeof interiorImageData !== "string" || !interiorImageData.startsWith("data:image/") || interiorImageData.length > 12_000_000)) ||
        !validPosition(xPct) || !validPosition(yPct) || !validSize(size) || typeof flipped !== "boolean" || !validLayer(layer) ||
        !isValidPetParkBuildingCapacity(maxPets)) {
      return res.status(400).json({ message: `Provide a name, exterior image, valid placement and a pet capacity from ${PET_PARK_BUILDING_CAPACITY_MIN} to ${PET_PARK_BUILDING_CAPACITY_MAX}` });
    }
    try {
      const imageUrl = await processWorldImage(imageData, 1200);
      const interiorImageUrl = interiorImageData ? await processWorldImage(interiorImageData, 2000) : null;
      const [building] = await db.insert(petParkBuildings).values({
        name: name.trim(), imageUrl, interiorImageUrl, xPct, yPct, size, flipped, layer, maxPets, interiorEffects: [],
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
    if (body.maxPets !== undefined) {
      if (!isValidPetParkBuildingCapacity(body.maxPets)) return res.status(400).json({ message: `Building capacity must be from ${PET_PARK_BUILDING_CAPACITY_MIN} to ${PET_PARK_BUILDING_CAPACITY_MAX}` });
      updates.maxPets = body.maxPets;
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
    try {
      if (updates.maxPets !== undefined || updates.interiorEffects !== undefined) {
        // Room changes and pet placements serialize through the same building lock.
        // Never delete, shrink or convert a room that currently contains pets.
        const result = await db.transaction(async tx => {
          const [existing] = await tx.select().from(petParkBuildings)
            .where(eq(petParkBuildings.id, String(req.params.id))).for("update");
          if (!existing) return { status: 404 as const };
          const occupants = await tx.select({ id: petParkDeposits.id, roomEffectId: petParkDeposits.roomEffectId })
            .from(petParkDeposits)
            .where(and(eq(petParkDeposits.buildingId, existing.id), isNull(petParkDeposits.withdrawnAt)));
          if (updates.maxPets !== undefined && occupants.length > (updates.maxPets as number))
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
    const { kind, effectType, imageData, xPct, yPct, size, flipped, layer } = req.body ?? {};
    if (!isKind(kind) || !validPosition(xPct) || !validPosition(yPct) ||
        !validSize(size) || typeof flipped !== "boolean" || !validLayer(layer) ||
        (imageData != null && (typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 8_000_000))) {
      return res.status(400).json({ message: "Invalid Pet Park item" });
    }
    if (kind === "decor" && !imageData) return res.status(400).json({ message: "Decor requires an image" });
    if (kind === "effect" && !isParkEffect(effectType)) return res.status(400).json({ message: "Choose a supported outdoor or water effect" });
    if (kind === "terrain" && !isPaintableParkTerrainDetail(effectType)) return res.status(400).json({ message: "Choose a valid terrain detail" });
    if (kind === "terrain" && imageData != null) return res.status(400).json({ message: "Terrain details do not use uploaded images" });
    try {
      const imageUrl = imageData ? await processWorldImage(imageData, 1200) : null;
      const [item] = await db.insert(petParkSceneItems)
        .values({ kind, effectType: kind === "effect" || kind === "terrain" ? effectType : null, imageUrl, xPct: Number(xPct), yPct: Number(yPct), size: Number(size), flipped, layer: Number(layer) }).returning();
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
        .values({ kind: "decor", imageUrl: original.imageUrl, effectType: null,
          xPct, yPct, size: original.size, flipped: original.flipped, layer: original.layer })
        .returning();
      return res.status(201).json(item);
    } catch (error) {
      console.error("[pet-park] decor duplication failed", error);
      return res.status(500).json({ message: "Unable to duplicate decoration" });
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
