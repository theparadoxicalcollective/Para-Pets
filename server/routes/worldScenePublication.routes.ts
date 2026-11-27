import type { Express, RequestHandler } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  worldScenePublications, worldSceneDrafts, worldSceneAssets,
  worldScenePlacements, worldSceneInteriorItems, shopItems, worldLocations, gameSettings,
} from "@shared/schema";
import {
  WORLD_DEFINITION_LIST, isKnownWorldId, isWorldOpenToPlayers,
} from "@shared/worlds/worldRegistry";
import type { db as database } from "../db";
import { auditWorldActivation, resolveLegacyNpcLocation, retiredLocationKey, effectiveRetiredLocations } from "@shared/worlds/worldScenePublication";

/**
 * Publication is an atomic pointer, not a migration: never modify or delete
 * old WorldPage backgrounds, locations, quests, shops or player progress.
 * The player scene is read-only; admin authoring routes stay private.
 */
export function registerWorldScenePublicationRoutes(app: Express, {
  db, isAuthenticated, isAdmin,
}: { db: typeof database; isAuthenticated: RequestHandler; isAdmin: RequestHandler }): void {
  app.get("/api/world-scene-publications", isAuthenticated, async (_req, res) => {
    try {
      const rows = await db.select().from(worldScenePublications);
      const byId = new Map(rows.map(row => [row.worldId, row]));
      return res.json(WORLD_DEFINITION_LIST.map(world => {
        const saved = byId.get(world.id);
        return { worldId: world.id, active: saved?.active === true,
          hasBeenLive: !!saved?.firstEnabledAt,
          firstEnabledAt: saved?.firstEnabledAt?.toISOString() ?? null,
          updatedAt: saved?.updatedAt?.toISOString() ?? null };
      }));
    } catch (error) {
      console.error("[world-publication] read failed", error);
      return res.status(500).json({ message: "Unable to read current world versions" });
    }
  });

  app.put("/api/admin/world-editor/:worldId/publication", isAdmin, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    if (req.body?.active !== true && req.body?.active !== false)
      return res.status(400).json({ message: "active must be a boolean" });
    const active: boolean = req.body.active;
    const saveAndSetLive = req.body?.saveAndSetLive === true;
    if (saveAndSetLive && !active)
      return res.status(400).json({ message: "Save & Set Live must activate this world." });
    try {
      const [existing] = await db.select().from(worldScenePublications)
        .where(eq(worldScenePublications.worldId, worldId)).limit(1);
      // A map toggle cannot accidentally expose an unfinished world. Only
      // Save & Set Live from the admin editor first authorizes that scene.
      if (active && !saveAndSetLive && !existing?.firstEnabledAt)
        return res.status(409).json({
          message: "Open this world's editor and select Save & Set Live first.",
        });
      // Recheck all connections whenever enabling from Old, including when
      // a previously live world was edited while offline. Never impede rollback.
      if (active && !existing?.active) {
        const [ground, placements, assets, npcs, locations, interiorItems] = await Promise.all([
          db.select({ worldId: worldSceneDrafts.worldId }).from(worldSceneDrafts)
            .where(eq(worldSceneDrafts.worldId, worldId)).limit(1),
          db.select({ id: worldScenePlacements.id, kind: worldScenePlacements.kind,
            assetId: worldScenePlacements.assetId, npcId: worldScenePlacements.npcId,
            legacyLocationId: worldScenePlacements.legacyLocationId, isShop: worldScenePlacements.isShop })
            .from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId)).limit(4501),
          db.select({ id: worldSceneAssets.id, kind: worldSceneAssets.kind, worldId: worldSceneAssets.worldId, name: worldSceneAssets.name,
            imageUrl: sql<string>`CASE WHEN length(${worldSceneAssets.imageUrl}) > 0 THEN 'ready' ELSE '' END` })
            .from(worldSceneAssets).where(eq(worldSceneAssets.worldId, worldId)).limit(301),
          db.select({ id: shopItems.id, name: shopItems.name,
            imageUrl: sql<string>`CASE WHEN length(${shopItems.imageUrl}) > 0 THEN 'ready' ELSE '' END` })
            .from(shopItems).where(and(eq(shopItems.type, "npc"), eq(shopItems.worldId, "__npc_catalog__"))),
          db.select({ id: worldLocations.id, worldId: worldLocations.worldId, name: worldLocations.name,
            type: worldLocations.type, isShop: worldLocations.isShop }).from(worldLocations),
          db.select({ kind: worldSceneInteriorItems.kind, assetId: worldSceneInteriorItems.assetId,
            buildingId: worldSceneInteriorItems.buildingId }).from(worldSceneInteriorItems)
            .where(eq(worldSceneInteriorItems.worldId, worldId)).limit(4501),
        ]);
        const blockers = auditWorldActivation(worldId, {
          hasGround: ground.length > 0, placements, assets, npcs, locations, interiorItems,
        });
        if (blockers.length) return res.status(409).json({
          message: "New world is not ready. " + blockers.join(" "), blockers,
        });
      }
      const now = new Date();
      const firstEnabledAt = existing?.firstEnabledAt ?? (saveAndSetLive ? now : null);
      const [updated] = await db.insert(worldScenePublications)
        .values({ worldId, active, firstEnabledAt, updatedAt: now })
        .onConflictDoUpdate({
          target: worldScenePublications.worldId,
          set: { active, firstEnabledAt, updatedAt: now },
        }).returning();
      res.set("Cache-Control", "no-store");
      return res.json({
        worldId, active: updated.active,
        hasBeenLive: !!updated.firstEnabledAt,
        firstEnabledAt: updated.firstEnabledAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error("[world-publication] switch failed", error);
      return res.status(500).json({ message: "Could not switch this world" });
    }
  });

  // Retire only the old map hotspot, never its ID, art, shop or quest data.
  // The preference is tied to the exact live building; removing the link or
  // switching back to Old automatically restores the original hotspot.
  app.get("/api/worlds/:worldId/retired-locations", isAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    try {
      const [publication] = await db.select().from(worldScenePublications)
        .where(eq(worldScenePublications.worldId, worldId)).limit(1);
      if (!publication?.active) return res.json([]);
      const links = await db.select({
        id: worldScenePlacements.id, kind: worldScenePlacements.kind,
        legacyLocationId: worldScenePlacements.legacyLocationId, legacyWorldId: worldLocations.worldId,
      }).from(worldScenePlacements)
        .innerJoin(worldLocations, eq(worldScenePlacements.legacyLocationId, worldLocations.id))
        .where(and(eq(worldScenePlacements.worldId, worldId), eq(worldLocations.worldId, worldId),
          eq(worldScenePlacements.kind, "building")));
      const keys = links.flatMap(link => link.legacyLocationId
        ? [retiredLocationKey(worldId, link.legacyLocationId)] : []);
      const settings = keys.length ? await db.select().from(gameSettings)
        .where(inArray(gameSettings.key, keys)) : [];
      res.set("Cache-Control", "private, no-store");
      return res.json(effectiveRetiredLocations(worldId, true, links, settings));
    } catch (error) {
      console.error("[world-publication] retired locations read failed", error);
      return res.status(500).json({ message: "Could not load retired locations" });
    }
  });

  app.put("/api/admin/world-editor/:worldId/placements/:placementId/retirement", isAdmin, async (req, res) => {
    const { worldId, placementId } = req.params;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId) || typeof placementId !== "string")
      return res.status(404).json({ message: "Unknown world or building" });
    if (typeof req.body?.retired !== "boolean")
      return res.status(400).json({ message: "Choose whether to retire the original hotspot" });
    try {
      const [linked] = await db.select({ locationId: worldLocations.id, locationType: worldLocations.type })
        .from(worldScenePlacements)
        .innerJoin(worldLocations, eq(worldScenePlacements.legacyLocationId, worldLocations.id))
        .where(and(eq(worldScenePlacements.id, placementId), eq(worldScenePlacements.worldId, worldId),
          eq(worldScenePlacements.kind, "building"), eq(worldLocations.worldId, worldId))).limit(1);
      if (!linked || linked.locationType === "npc") return res.status(409).json({
        message: "Retirement requires a building linked to an original location in this same world.",
      });
      const key = retiredLocationKey(worldId, linked.locationId);
      if (req.body.retired) {
        const [publication] = await db.select().from(worldScenePublications)
          .where(eq(worldScenePublications.worldId, worldId)).limit(1);
        if (!publication?.active) return res.status(409).json({ message: "Set this world live and verify the building first." });
        await db.insert(gameSettings).values({ key, value: placementId })
          .onConflictDoUpdate({ target: gameSettings.key, set: { value: placementId } });
      } else {
        await db.delete(gameSettings).where(and(eq(gameSettings.key, key), eq(gameSettings.value, placementId)));
      }
      return res.json({ retired: req.body.retired, locationId: linked.locationId });
    } catch (error) {
      console.error("[world-publication] retirement failed", error);
      return res.status(500).json({ message: "Could not update original hotspot visibility" });
    }
  });

  app.get("/api/worlds/:worldId/player-scene", isAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    const viewer = req.user as { isAdmin?: boolean; isModerator?: boolean } | undefined;
    // Match the actual world-map gate, including already-public Haunted Woods.
    if (!viewer?.isAdmin && !viewer?.isModerator &&
        worldId !== "haunted_woods" && !isWorldOpenToPlayers(worldId))
      return res.status(403).json({ message: "This world is locked" });
    try {
      const [publication] = await db.select().from(worldScenePublications)
        .where(eq(worldScenePublications.worldId, worldId)).limit(1);
      if (!publication?.active) return res.status(404).json({ message: "The old world is active" });
      const [draft, assets, placements, interiorItems] = await Promise.all([
        db.select().from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId)).limit(1),
        db.select().from(worldSceneAssets).where(eq(worldSceneAssets.worldId, worldId))
          .orderBy(asc(worldSceneAssets.createdAt)).limit(301),
        db.select().from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId))
          .orderBy(asc(worldScenePlacements.createdAt)).limit(4501),
        db.select().from(worldSceneInteriorItems).where(eq(worldSceneInteriorItems.worldId, worldId))
          .orderBy(asc(worldSceneInteriorItems.createdAt)).limit(4501),
      ]);
      if (!draft.length || assets.length > 300 || placements.length > 4500 ||
          interiorItems.length > 4500)
        return res.status(409).json({ message: "This world is not ready for players" });
      const linkedIds = [...new Set(placements.map(p => p.legacyLocationId).filter((id): id is string => !!id))];
      const npcIds = [...new Set(placements.map(p => p.npcId).filter((id): id is string => !!id))];
      const [buildingLinks, npcs, localNpcLocations] = await Promise.all([
        linkedIds.length ? db.select({
          id: worldLocations.id, worldId: worldLocations.worldId, name: worldLocations.name,
          type: worldLocations.type, bgUrl: worldLocations.bgUrl, isShop: worldLocations.isShop,
        }).from(worldLocations).where(inArray(worldLocations.id, linkedIds)) : Promise.resolve([]),
        npcIds.length ? db.select({
          id: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
          specialSkill: shopItems.specialSkill,
        }).from(shopItems).where(and(inArray(shopItems.id, npcIds),
          eq(shopItems.type, "npc"), eq(shopItems.worldId, "__npc_catalog__"))) : Promise.resolve([]),
        db.select({ id: worldLocations.id, worldId: worldLocations.worldId, name: worldLocations.name,
          type: worldLocations.type, isShop: worldLocations.isShop })
          .from(worldLocations).where(and(eq(worldLocations.worldId, worldId), eq(worldLocations.type, "npc"))),
      ]);
      const connectedNpcs = npcs.map(npc => ({
        ...npc, legacyLocationId: resolveLegacyNpcLocation(worldId, npc.name, localNpcLocations)?.id ?? null,
      }));
      const npcLocationIds = new Set(connectedNpcs.map(npc => npc.legacyLocationId));
      const linkedPages = [...buildingLinks, ...localNpcLocations
        .filter(loc => npcLocationIds.has(loc.id) && !buildingLinks.some(page => page.id === loc.id))
        .map(loc => ({ ...loc, bgUrl: null }))];
      // No editor permissions or private catalog endpoints are exposed.
      // Every saved scene edit is read directly from the live source tables
      // (there is no separate published snapshot to become stale).
      res.set("Cache-Control", "private, no-cache");
      return res.json({
        worldId, groundLevel: draft[0].groundLevel, groundTheme: draft[0].groundTheme,
        assets, placements, interiorItems, linkedPages, npcs: connectedNpcs,
      });
    } catch (error) {
      console.error("[world-publication] player scene read failed", error);
      return res.status(500).json({ message: "Could not load the active world" });
    }
  });
}
