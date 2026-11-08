import type { Express, Request, RequestHandler } from "express";
import { and, asc, count, eq, ilike, inArray, ne } from "drizzle-orm";
import {
  shopItems, worldSceneAssets, worldSceneDrafts, worldScenePlacements, worldSceneInteriorItems,
} from "@shared/schema";
import { defaultWorldSceneDraft, isEditableWorldSceneId } from "@shared/worlds/worldSceneDraft";
import {
  validWorldArtwork, validPosition, validSize, validLayer, validSceneId,
  validDecorEffects, validEffect, validPlacementTransform, validShopIds,
  isWorldTerrainType, WORLD_TERRAIN_BRUSH_SIZES, worldTerrainCell,
} from "@shared/worlds/worldSceneContent";
import { parkGroundSize } from "@shared/petParkGround";
import { isValidParkLightColor } from "@shared/petParkEffects";
import { HOUSE_INTERIOR_DARKNESS_MIN, HOUSE_INTERIOR_DARKNESS_MAX } from "@shared/housing";
import { validParkShopPlacements, type ParkShopPlacement } from "@shared/petParkShopPlacements";
import type { WorldId } from "@shared/worlds/worldRegistry";
import type { db as database } from "../db";

type Store = typeof database;
type Asset = typeof worldSceneAssets.$inferSelect;
type Placement = typeof worldScenePlacements.$inferSelect;
const MAX_ASSETS = 300;
const MAX_OBJECTS = 4500;
const MAX_INTERIOR = 120;

function worldFrom(req: Request): WorldId | null {
  const id = req.params.worldId;
  return typeof id === "string" && isEditableWorldSceneId(id) ? id : null;
}
function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;
}
function assetKind(value: unknown): value is "decor" | "building" {
  return value === "decor" || value === "building";
}
async function findAsset(db: Store, worldId: string, id: unknown): Promise<Asset | undefined> {
  if (!validSceneId(id)) return undefined;
  const [asset] = await db.select().from(worldSceneAssets).where(
    and(eq(worldSceneAssets.worldId, worldId), eq(worldSceneAssets.id, id)));
  return asset;
}
async function findPlacement(db: Store, worldId: string, id: unknown): Promise<Placement | undefined> {
  if (!validSceneId(id)) return undefined;
  const [item] = await db.select().from(worldScenePlacements).where(
    and(eq(worldScenePlacements.worldId, worldId), eq(worldScenePlacements.id, id)));
  return item;
}
async function validGlobalCatalogItems(db: Store, ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const existing = await db.select({ id: shopItems.id }).from(shopItems)
    .where(and(inArray(shopItems.id, ids), ne(shopItems.type, "garden_fruit")));
  return existing.length === ids.length;
}
async function withinLimit(db: Store, table: typeof worldSceneAssets | typeof worldScenePlacements, worldId: string, limit: number) {
  if (table === worldSceneAssets) {
    const [row] = await db.select({ total: count() }).from(worldSceneAssets)
      .where(eq(worldSceneAssets.worldId, worldId));
    return row.total < limit;
  }
  const [row] = await db.select({ total: count() }).from(worldScenePlacements)
    .where(eq(worldScenePlacements.worldId, worldId));
  return row.total < limit;
}

export function registerWorldSceneContentRoutes(app: Express, {
  db, isAdmin, processWorldImage,
}: { db: Store; isAdmin: RequestHandler; processWorldImage: (data: string, size: number) => Promise<string> }): void {
  // All scene reads and writes are private; no publication switch or Pet Park endpoint.
  app.get("/api/admin/world-editor/:worldId/scene", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const [assets, placements, interiorItems] = await Promise.all([
        db.select().from(worldSceneAssets).where(eq(worldSceneAssets.worldId, worldId))
          .orderBy(asc(worldSceneAssets.createdAt)).limit(MAX_ASSETS + 1),
        db.select().from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId))
          .orderBy(asc(worldScenePlacements.createdAt)).limit(MAX_OBJECTS + 1),
        db.select().from(worldSceneInteriorItems).where(eq(worldSceneInteriorItems.worldId, worldId))
          .orderBy(asc(worldSceneInteriorItems.createdAt)).limit(MAX_OBJECTS + 1),
      ]);
      if (assets.length > MAX_ASSETS || placements.length > MAX_OBJECTS || interiorItems.length > MAX_OBJECTS) {
        return res.status(409).json({ message: "World draft exceeds supported scene limits" });
      }
      return res.json({ assets, placements, interiorItems });
    } catch (error) {
      console.error("[world-editor] scene read failed", error);
      return res.status(500).json({ message: "Could not read private world scene" });
    }
  });

  app.post("/api/admin/world-editor/:worldId/assets", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const { kind, name, imageData, tapImageData = null, interiorImageData = null } = req.body ?? {};
    if (!assetKind(kind) || !validName(name) || !validWorldArtwork(imageData) ||
      (tapImageData !== null && !validWorldArtwork(tapImageData)) ||
      (interiorImageData !== null && !validWorldArtwork(interiorImageData)) ||
      (kind !== "building" && interiorImageData !== null)) {
      return res.status(400).json({ message: "Invalid world asset upload" });
    }
    try {
      if (!(await withinLimit(db, worldSceneAssets, worldId, MAX_ASSETS)))
        return res.status(409).json({ message: "World asset library is full" });
      const imageUrl = await processWorldImage(imageData, 2000);
      const tapImageUrl = tapImageData ? await processWorldImage(tapImageData, 2000) : null;
      const interiorImageUrl = interiorImageData ? await processWorldImage(interiorImageData, 2400) : null;
      const [asset] = await db.insert(worldSceneAssets).values({
        worldId, kind, name: name.trim(), imageUrl, tapImageUrl, interiorImageUrl,
      }).returning();
      return res.status(201).json(asset);
    } catch (error) {
      console.error("[world-editor] asset create failed", error);
      return res.status(500).json({ message: "Could not upload world artwork" });
    }
  });

  app.patch("/api/admin/world-editor/:worldId/assets/:assetId", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const asset = await findAsset(db, worldId, req.params.assetId);
      if (!asset) return res.status(404).json({ message: "Asset not found in this world" });
      const body = req.body ?? {};
      const changes: Partial<typeof worldSceneAssets.$inferInsert> = {};
      if ("name" in body) {
        if (!validName(body.name)) return res.status(400).json({ message: "Invalid asset name" });
        changes.name = body.name.trim();
      }
      for (const [input, field, size] of [
        ["imageData", "imageUrl", 2000],
        ["tapImageData", "tapImageUrl", 2000],
        ["interiorImageData", "interiorImageUrl", 2400],
      ] as const) {
        if (!(input in body)) continue;
        if (input === "interiorImageData" && asset.kind !== "building")
          return res.status(400).json({ message: "Only buildings have interiors" });
        if (body[input] === null && field !== "imageUrl") changes[field] = null;
        else {
          if (!validWorldArtwork(body[input]))
            return res.status(400).json({ message: "Invalid image upload" });
          changes[field] = await processWorldImage(body[input], size);
        }
      }
      if (!Object.keys(changes).length) return res.status(400).json({ message: "No changes supplied" });
      const [updated] = await db.update(worldSceneAssets).set(changes).where(
        and(eq(worldSceneAssets.id, asset.id), eq(worldSceneAssets.worldId, worldId))).returning();
      return res.json(updated);
    } catch (error) {
      console.error("[world-editor] asset update failed", error);
      return res.status(500).json({ message: "Could not update asset" });
    }
  });

  app.delete("/api/admin/world-editor/:worldId/assets/:assetId", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const asset = await findAsset(db, worldId, req.params.assetId);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      const [outdoor, indoor] = await Promise.all([
        db.select({ id: worldScenePlacements.id }).from(worldScenePlacements).where(
          and(eq(worldScenePlacements.worldId, worldId), eq(worldScenePlacements.assetId, asset.id))).limit(1),
        db.select({ id: worldSceneInteriorItems.id }).from(worldSceneInteriorItems).where(
          and(eq(worldSceneInteriorItems.worldId, worldId), eq(worldSceneInteriorItems.assetId, asset.id))).limit(1),
      ]);
      if (outdoor.length || indoor.length) return res.status(409).json({
        message: "Remove every placed copy before deleting its artwork",
      });
      await db.delete(worldSceneAssets).where(
        and(eq(worldSceneAssets.worldId, worldId), eq(worldSceneAssets.id, asset.id)));
      return res.json({ deleted: true });
    } catch (error) {
      console.error("[world-editor] asset delete failed", error);
      return res.status(500).json({ message: "Could not delete world asset" });
    }
  });

  // Player inventory and shop item identities remain global and shared.
  // Only the building's placement and selected stock IDs belong to a world.
  app.get("/api/admin/world-editor/:worldId/shop-catalog", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
      const items = await db.select({
        id: shopItems.id, name: shopItems.name, type: shopItems.type,
        price: shopItems.price, imageUrl: shopItems.imageUrl,
        eggImageUrl: shopItems.eggImageUrl, hatchedImageUrl: shopItems.hatchedImageUrl,
      }).from(shopItems).where(and(
        ne(shopItems.type, "garden_fruit"),
        q ? ilike(shopItems.name, "%" + q + "%") : undefined,
      )).orderBy(asc(shopItems.name)).limit(100);
      return res.json(items);
    } catch (error) {
      console.error("[world-editor] catalog read failed", error);
      return res.status(500).json({ message: "Could not load catalog" });
    }
  });

  app.get("/api/admin/world-editor/:worldId/buildings/:buildingId/shop-stock", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const building = await findPlacement(db, worldId, req.params.buildingId);
      if (!building || building.kind !== "building")
        return res.status(404).json({ message: "World building not found" });
      if (!building.shopItemIds.length) return res.json([]);
      const items = await db.select({
        id: shopItems.id, name: shopItems.name, type: shopItems.type, price: shopItems.price,
        imageUrl: shopItems.imageUrl, eggImageUrl: shopItems.eggImageUrl,
        hatchedImageUrl: shopItems.hatchedImageUrl,
      }).from(shopItems).where(and(
        inArray(shopItems.id, building.shopItemIds),
        ne(shopItems.type, "garden_fruit"),
      ));
      return res.json(items);
    } catch (error) {
      console.error("[world-editor] shop stock read failed", error);
      return res.status(500).json({ message: "Could not load shop merchandise" });
    }
  });

  app.post("/api/admin/world-editor/:worldId/placements", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const body = req.body ?? {};
    const { kind, assetId, effectType = null, effectColor = null, decorEffects = [],
      isWaterSource = false, isShop = false, shopItemIds = [] } = body;
    if (!["decor", "building", "effect"].includes(kind) ||
      !validPlacementTransform(body) || !validDecorEffects(decorEffects) ||
      typeof isWaterSource !== "boolean" || typeof isShop !== "boolean" ||
      !validShopIds(shopItemIds)) {
      return res.status(400).json({ message: "Invalid placement details" });
    }
    if (kind === "effect" && effectType === "colored_light"
      ? !isValidParkLightColor(effectColor) : effectColor != null)
      return res.status(400).json({ message: "Invalid colored light orb color" });
    if (((kind !== "decor" && isWaterSource) || (kind === "effect" && decorEffects.length)) ||
      (kind !== "building" && (isShop || shopItemIds.length)) ||
      (kind === "effect" ? !validEffect(effectType) || assetId != null : effectType != null)) {
      return res.status(400).json({ message: "Invalid object-specific settings" });
    }
    try {
      if (kind !== "effect") {
        const asset = await findAsset(db, worldId, assetId);
        if (!asset || asset.kind !== kind) return res.status(400).json({
          message: "Select a matching asset from this world's library",
        });
      }
      if (!(await validGlobalCatalogItems(db, shopItemIds))) return res.status(400).json({
        message: "Select existing shared inventory items for the shop",
      });
      if (!(await withinLimit(db, worldScenePlacements, worldId, MAX_OBJECTS)))
        return res.status(409).json({ message: "World placement limit reached" });
      const [placed] = await db.insert(worldScenePlacements).values({
        worldId, kind, assetId: kind === "effect" ? null : assetId, effectType,
        effectColor: kind === "effect" && effectType === "colored_light" ? effectColor : null,
        xPct: body.xPct, yPct: body.yPct, size: body.size,
        flipped: body.flipped, layer: body.layer,
        decorEffects, isWaterSource, isShop, shopItemIds, shopItemPlacements: [],
      }).returning();
      return res.status(201).json(placed);
    } catch (error) {
      console.error("[world-editor] placement create failed", error);
      return res.status(500).json({ message: "Could not place object" });
    }
  });

  app.patch("/api/admin/world-editor/:worldId/placements/:placementId", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const saved = await findPlacement(db, worldId, req.params.placementId);
      if (!saved) return res.status(404).json({ message: "Object not found in this world" });
      const body = req.body ?? {};
      const changes: Partial<typeof worldScenePlacements.$inferInsert> = {};
      for (const key of ["xPct", "yPct"] as const) if (key in body) {
        if (!validPosition(body[key])) return res.status(400).json({ message: "Invalid position" });
        changes[key] = body[key];
      }
      if ("size" in body) {
        if (!validSize(body.size)) return res.status(400).json({ message: "Invalid size" });
        changes.size = body.size;
      }
      if ("flipped" in body) {
        if (typeof body.flipped !== "boolean") return res.status(400).json({ message: "Invalid flip setting" });
        changes.flipped = body.flipped;
      }
      if ("layer" in body) {
        if (!validLayer(body.layer)) return res.status(400).json({ message: "Invalid layer" });
        changes.layer = body.layer;
      }
      if ("effectColor" in body) {
        if (saved.kind !== "effect" || saved.effectType !== "colored_light" ||
          !isValidParkLightColor(body.effectColor))
          return res.status(400).json({ message: "Invalid colored light orb color" });
        changes.effectColor = body.effectColor;
      }
      if ("interiorDarkness" in body) {
        if (saved.kind !== "building" || !Number.isInteger(body.interiorDarkness) ||
            body.interiorDarkness < HOUSE_INTERIOR_DARKNESS_MIN ||
            body.interiorDarkness > HOUSE_INTERIOR_DARKNESS_MAX)
          return res.status(400).json({ message: "Interior darkness must be from 0 to 90%" });
        changes.interiorDarkness = body.interiorDarkness;
      }
      if ("interiorNightDarkness" in body) {
        if (saved.kind !== "building" || !Number.isInteger(body.interiorNightDarkness) ||
            body.interiorNightDarkness < HOUSE_INTERIOR_DARKNESS_MIN ||
            body.interiorNightDarkness > HOUSE_INTERIOR_DARKNESS_MAX)
          return res.status(400).json({ message: "Peak night darkness must be from 0 to 90%" });
        changes.interiorNightDarkness = body.interiorNightDarkness;
      }
      if ("decorEffects" in body) {
        if ((saved.kind !== "decor" && saved.kind !== "building") || !validDecorEffects(body.decorEffects))
          return res.status(400).json({ message: "Invalid attached effects" });
        changes.decorEffects = body.decorEffects;
      }
      if ("isWaterSource" in body) {
        if (saved.kind !== "decor" || typeof body.isWaterSource !== "boolean")
          return res.status(400).json({ message: "Invalid water source" });
        changes.isWaterSource = body.isWaterSource;
      }
      if ("isShop" in body) {
        if (saved.kind !== "building" || typeof body.isShop !== "boolean")
          return res.status(400).json({ message: "Invalid shop setting" });
        changes.isShop = body.isShop;
      }
      if ("shopItemIds" in body) {
        if (saved.kind !== "building" || !validShopIds(body.shopItemIds) ||
          !(await validGlobalCatalogItems(db, body.shopItemIds)))
          return res.status(400).json({ message: "Invalid shop stock" });
        changes.shopItemIds = body.shopItemIds;
        changes.shopItemPlacements = saved.shopItemPlacements.filter(p => body.shopItemIds.includes(p.itemId));
      }
      if ("shopItemPlacements" in body) {
        const activeStock = changes.shopItemIds ?? saved.shopItemIds;
        if (saved.kind !== "building" || !validParkShopPlacements(body.shopItemPlacements) ||
          body.shopItemPlacements.some((p: ParkShopPlacement) => !activeStock.includes(p.itemId))) {
          return res.status(400).json({ message: "Invalid shop merchandise layout" });
        }
        changes.shopItemPlacements = body.shopItemPlacements;
      }
      if (!Object.keys(changes).length) return res.status(400).json({ message: "No changes supplied" });
      const updated = await db.transaction(async tx => {
        const [placed] = await tx.update(worldScenePlacements).set(changes).where(
          and(eq(worldScenePlacements.worldId, worldId), eq(worldScenePlacements.id, saved.id))).returning();
        // Match Pet Park linked decorations: artwork and attached visual effects
        // belong to this world asset, but each copy keeps its own position,
        // size and orientation. Never synchronize placements across worlds.
        if (placed && saved.kind === "decor" && saved.assetId && "decorEffects" in changes) {
          await tx.update(worldScenePlacements)
            .set({ decorEffects: changes.decorEffects })
            .where(and(
              eq(worldScenePlacements.worldId, worldId),
              eq(worldScenePlacements.kind, "decor"),
              eq(worldScenePlacements.assetId, saved.assetId),
            ));
        }
        return placed;
      });
      return res.json(updated);
    } catch (error) {
      console.error("[world-editor] placement update failed", error);
      return res.status(500).json({ message: "Could not update placement" });
    }
  });

  app.delete("/api/admin/world-editor/:worldId/placements/:placementId", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const id = req.params.placementId;
    if (!validSceneId(id)) return res.status(404).json({ message: "Object not found" });
    try {
      const deleted = await db.delete(worldScenePlacements).where(
        and(eq(worldScenePlacements.worldId, worldId), eq(worldScenePlacements.id, id)))
        .returning({ id: worldScenePlacements.id });
      return deleted.length ? res.json({ deleted: true }) : res.status(404).json({ message: "Object not found" });
    } catch (error) {
      console.error("[world-editor] placement delete failed", error);
      return res.status(500).json({ message: "Could not delete placement" });
    }
  });

  // Private-draft equivalent of Pet Park's one-tap Clear terrain control.
  // Restrict deletion to this world's terrain placements; other scene content,
  // Pet Park and existing player worlds remain untouched.
  app.delete("/api/admin/world-editor/:worldId/terrain", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    try {
      const deleted = await db.delete(worldScenePlacements).where(and(
        eq(worldScenePlacements.worldId, worldId),
        eq(worldScenePlacements.kind, "terrain"),
      )).returning({ id: worldScenePlacements.id });
      return res.json({ deleted: deleted.length });
    } catch (error) {
      console.error("[world-editor] clearing terrain failed", error);
      return res.status(500).json({ message: "Could not clear world terrain" });
    }
  });

  // The same centered isometric grid as Pet Park, but no Pet Park table writes.
  app.post("/api/admin/world-editor/:worldId/terrain-strokes", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const { type, size, points } = req.body ?? {};
    if (!isWorldTerrainType(type) || !WORLD_TERRAIN_BRUSH_SIZES.includes(size) ||
      !Array.isArray(points) || points.length < 1 || points.length > 60 ||
      !points.every(p => p && validPosition(p.xPct) && validPosition(p.yPct))) {
      return res.status(400).json({ message: "Invalid terrain stroke" });
    }
    try {
      const [saved] = await db.select({ groundLevel: worldSceneDrafts.groundLevel })
        .from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId));
      const level = saved?.groundLevel ?? defaultWorldSceneDraft(worldId).groundLevel;
      const dimensions = parkGroundSize(level);
      const cells = new Map<string, { xPct: number; yPct: number; key: string }>();
      for (const point of points) {
        const cell = worldTerrainCell(point, dimensions, type, size);
        if (!cell) return res.status(400).json({ message: "Terrain stroke is outside the ground" });
        cells.set(cell.key, cell);
      }
      const [countRow] = await db.select({ total: count() }).from(worldScenePlacements)
        .where(eq(worldScenePlacements.worldId, worldId));
      if (countRow.total + cells.size > MAX_OBJECTS)
        return res.status(409).json({ message: "World terrain is full" });
      const created = await db.insert(worldScenePlacements).values([...cells.values()].map(cell => ({
        worldId, kind: "terrain", effectType: type, terrainKey: cell.key,
        xPct: cell.xPct, yPct: cell.yPct, size,
        flipped: false, layer: 0,
      }))).onConflictDoNothing().returning();
      return res.status(201).json({ items: created });
    } catch (error) {
      console.error("[world-editor] terrain stroke failed", error);
      return res.status(500).json({ message: "Could not paint terrain" });
    }
  });

  // One direct erase stroke; only tiles of the chosen material in this world.
  // No confirmation dialog, and never touches Pet Park or another realm.
  app.post("/api/admin/world-editor/:worldId/terrain-erase", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const { type, size, points } = req.body ?? {};
    if (!isWorldTerrainType(type) || !WORLD_TERRAIN_BRUSH_SIZES.includes(size) ||
      !Array.isArray(points) || points.length < 1 || points.length > 60 ||
      !points.every(p => p && validPosition(p.xPct) && validPosition(p.yPct))) {
      return res.status(400).json({ message: "Invalid terrain erase stroke" });
    }
    try {
      const [saved] = await db.select({ groundLevel: worldSceneDrafts.groundLevel })
        .from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId));
      const dimensions = parkGroundSize(saved?.groundLevel ?? defaultWorldSceneDraft(worldId).groundLevel);
      const keys = new Set<string>();
      for (const point of points) {
        const cell = worldTerrainCell(point, dimensions, type, size);
        if (cell) keys.add(cell.key);
      }
      if (!keys.size) return res.json({ deleted: 0 });
      const deleted = await db.delete(worldScenePlacements).where(and(
        eq(worldScenePlacements.worldId, worldId),
        eq(worldScenePlacements.kind, "terrain"),
        inArray(worldScenePlacements.terrainKey, [...keys]),
      )).returning({ id: worldScenePlacements.id });
      return res.json({ deleted: deleted.length });
    } catch (error) {
      console.error("[world-editor] terrain erase failed", error);
      return res.status(500).json({ message: "Could not erase terrain" });
    }
  });

  app.post("/api/admin/world-editor/:worldId/interior-items", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const body = req.body ?? {};
    if (!validSceneId(body.buildingId) || !["decor", "effect"].includes(body.kind) ||
        !validPosition(body.xPct) || !validPosition(body.yPct) ||
        !validSize(body.size) || typeof body.flipped !== "boolean") {
      return res.status(400).json({ message: "Invalid interior item" });
    }
    try {
      const building = await findPlacement(db, worldId, body.buildingId);
      if (!building || building.kind !== "building")
        return res.status(400).json({ message: "Select a building from this world" });
      if (body.kind === "decor") {
        const asset = await findAsset(db, worldId, body.assetId);
        if (!asset || asset.kind !== "decor" || body.effectType != null)
          return res.status(400).json({ message: "Select an interior decoration from this world" });
      } else if (!validEffect(body.effectType) || body.assetId != null) {
        return res.status(400).json({ message: "Invalid interior effect" });
      }
      const [row] = await db.select({ total: count() }).from(worldSceneInteriorItems).where(
        and(eq(worldSceneInteriorItems.worldId, worldId), eq(worldSceneInteriorItems.buildingId, building.id)));
      if (row.total >= MAX_INTERIOR) return res.status(409).json({ message: "Interior item limit reached" });
      const [created] = await db.insert(worldSceneInteriorItems).values({
        worldId, buildingId: building.id, kind: body.kind,
        assetId: body.kind === "decor" ? body.assetId : null,
        effectType: body.kind === "effect" ? body.effectType : null,
        xPct: body.xPct, yPct: body.yPct, size: body.size, flipped: body.flipped,
      }).returning();
      return res.status(201).json(created);
    } catch (error) {
      console.error("[world-editor] interior create failed", error);
      return res.status(500).json({ message: "Could not add interior object" });
    }
  });

  app.patch("/api/admin/world-editor/:worldId/interior-items/:itemId", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const id = req.params.itemId;
    if (!validSceneId(id)) return res.status(404).json({ message: "Interior item not found" });
    try {
      const [saved] = await db.select().from(worldSceneInteriorItems).where(
        and(eq(worldSceneInteriorItems.worldId, worldId), eq(worldSceneInteriorItems.id, id)));
      if (!saved) return res.status(404).json({ message: "Interior item not found" });
      const body = req.body ?? {};
      const changes: Partial<typeof worldSceneInteriorItems.$inferInsert> = {};
      for (const key of ["xPct", "yPct"] as const) if (key in body) {
        if (!validPosition(body[key])) return res.status(400).json({ message: "Invalid position" });
        changes[key] = body[key];
      }
      if ("size" in body) {
        if (!validSize(body.size)) return res.status(400).json({ message: "Invalid size" });
        changes.size = body.size;
      }
      if ("flipped" in body) {
        if (typeof body.flipped !== "boolean") return res.status(400).json({ message: "Invalid flip" });
        changes.flipped = body.flipped;
      }
      if (!Object.keys(changes).length) return res.status(400).json({ message: "No changes supplied" });
      const [updated] = await db.update(worldSceneInteriorItems).set(changes).where(
        and(eq(worldSceneInteriorItems.worldId, worldId), eq(worldSceneInteriorItems.id, id))).returning();
      return res.json(updated);
    } catch (error) {
      console.error("[world-editor] interior update failed", error);
      return res.status(500).json({ message: "Could not update interior item" });
    }
  });

  app.delete("/api/admin/world-editor/:worldId/interior-items/:itemId", isAdmin, async (req, res) => {
    const worldId = worldFrom(req);
    if (!worldId) return res.status(404).json({ message: "Unknown world" });
    const id = req.params.itemId;
    if (!validSceneId(id)) return res.status(404).json({ message: "Interior item not found" });
    try {
      const deleted = await db.delete(worldSceneInteriorItems).where(
        and(eq(worldSceneInteriorItems.worldId, worldId), eq(worldSceneInteriorItems.id, id)))
        .returning({ id: worldSceneInteriorItems.id });
      return deleted.length ? res.json({ deleted: true }) : res.status(404).json({ message: "Interior item not found" });
    } catch (error) {
      console.error("[world-editor] interior delete failed", error);
      return res.status(500).json({ message: "Could not delete interior item" });
    }
  });
}
