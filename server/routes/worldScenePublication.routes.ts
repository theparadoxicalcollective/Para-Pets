import { loadSceneMiniPets } from "../sceneMiniPets";
import type { Express, RequestHandler } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  worldScenePublications, worldSceneDrafts, worldSceneAssets,
  worldScenePlacements, worldSceneInteriorItems, shopItems, worldLocations, gameSettings,
} from "@shared/schema";
import {
  WORLD_DEFINITION_LIST, isKnownWorldId,
} from "@shared/worlds/worldRegistry";
import type { db as database } from "../db";
import { referencedWorldAssetFilter } from "../worldSceneAssetUsage";
import { WORLD_SCENE_MAX_ASSETS } from "@shared/worlds/worldSceneContent";
import { effectiveWorldLocked, worldLockKey } from "@shared/worlds/worldAccess";
import { defaultWorldSceneDraft } from "@shared/worlds/worldSceneDraft";
import { auditWorldActivation, resolveLegacyNpcLocation, retiredLocationKey, effectiveRetiredLocations } from "@shared/worlds/worldScenePublication";

/**
 * Every registered world reads its saved new scene. World locks are independent
 * of scene data. Original gameplay locations and player progress stay intact.
 * The player scene is read-only; admin authoring routes stay private.
 */
export function registerWorldScenePublicationRoutes(app: Express, {
  db, isAuthenticated, isAdmin,
}: { db: typeof database; isAuthenticated: RequestHandler; isAdmin: RequestHandler }): void {
  app.get("/api/world-scene-publications", isAuthenticated, async (_req, res) => {
    try {
      const [rows, locks] = await Promise.all([
        db.select().from(worldScenePublications),
        db.select().from(gameSettings).where(inArray(gameSettings.key, WORLD_DEFINITION_LIST.map(world => worldLockKey(world.id)))),
      ]);
      const byId = new Map(rows.map(row => [row.worldId, row]));
      const byKey = new Map(locks.map(row => [row.key, row.value]));
      res.set("Cache-Control", "private, no-store");
      return res.json(WORLD_DEFINITION_LIST.map(world => {
        const saved = byId.get(world.id);
        return { worldId: world.id, active: true, hasBeenLive: true,
          locked: effectiveWorldLocked(world.id, byKey.get(worldLockKey(world.id))),
          firstEnabledAt: saved?.firstEnabledAt?.toISOString() ?? null,
          updatedAt: saved?.updatedAt?.toISOString() ?? null };
      }));
    } catch (error) {
      console.error("[world-publication] read failed", error);
      return res.status(500).json({ message: "Unable to read current world versions" });
    }
  });

  // The old publication endpoint is kept for cached older admin clients,
  // but it can no longer select the original map for players.
  app.put("/api/admin/world-editor/:worldId/publication", isAdmin, (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    if (req.body?.active !== true) return res.status(409).json({
      message: "New worlds are the default. Manage player access in Admin Realm → Worlds.",
    });
    return res.json({ worldId, active: true, hasBeenLive: true, firstEnabledAt: null, updatedAt: null });
  });

  app.put("/api/admin/worlds/:worldId/lock", isAdmin, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    if (typeof req.body?.locked !== "boolean")
      return res.status(400).json({ message: "locked must be a boolean" });
    try {
      const locked: boolean = req.body.locked;
      // Incomplete migration is fine. Still guard against actual broken scene
      // references and limits when opening a locked world.
      if (!locked) {
        const [placements, assets, npcs, locations, interiorItems] = await Promise.all([
          db.select({ id: worldScenePlacements.id, kind: worldScenePlacements.kind,
            assetId: worldScenePlacements.assetId, npcId: worldScenePlacements.npcId, miniPetId: worldScenePlacements.miniPetId,
            legacyLocationId: worldScenePlacements.legacyLocationId, isShop: worldScenePlacements.isShop })
            .from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId)).limit(4501),
          db.select({ id: worldSceneAssets.id, kind: worldSceneAssets.kind, worldId: worldSceneAssets.worldId, name: worldSceneAssets.name,
            imageUrl: sql<string>`CASE WHEN length(${worldSceneAssets.imageUrl}) > 0 THEN 'ready' ELSE '' END` })
            .from(worldSceneAssets).where(referencedWorldAssetFilter(worldId)).limit(WORLD_SCENE_MAX_ASSETS + 1),
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
          hasGround: true, placements, assets, npcs, locations, interiorItems,
          miniPets: await loadSceneMiniPets(db, placements.map(p => p.miniPetId)),
        });
        if (blockers.length) return res.status(409).json({
          message: "Resolve these scene errors before unlocking. " + blockers.join(" "), blockers,
        });
      }
      const key = worldLockKey(worldId);
      await db.insert(gameSettings).values({ key, value: String(locked) })
        .onConflictDoUpdate({ target: gameSettings.key, set: { value: String(locked) } });
      res.set("Cache-Control", "no-store");
      return res.json({ worldId, locked });
    } catch (error) {
      console.error("[world-access] lock update failed", error);
      return res.status(500).json({ message: "Could not update world access" });
    }
  });

  // Retire only the old map hotspot, never its ID, art, shop or quest data.
  // The preference is tied to the exact live building; removing the link
  // automatically restores the original hotspot in the retained admin map.
  app.get("/api/worlds/:worldId/retired-locations", isAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isKnownWorldId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    try {
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
    try {
      if (!viewer?.isAdmin && !viewer?.isModerator) {
        const [lock] = await db.select().from(gameSettings).where(eq(gameSettings.key, worldLockKey(worldId))).limit(1);
        if (effectiveWorldLocked(worldId, lock?.value))
          return res.status(403).json({ message: "Coming Soon" });
      }
      const [draft, assets, placements, interiorItems] = await Promise.all([
        db.select().from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId)).limit(1),
        db.select().from(worldSceneAssets).where(referencedWorldAssetFilter(worldId))
          .orderBy(asc(worldSceneAssets.createdAt)).limit(WORLD_SCENE_MAX_ASSETS + 1),
        db.select().from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId))
          .orderBy(asc(worldScenePlacements.createdAt)).limit(4501),
        db.select().from(worldSceneInteriorItems).where(eq(worldSceneInteriorItems.worldId, worldId))
          .orderBy(asc(worldSceneInteriorItems.createdAt)).limit(4501),
      ]);
      if (assets.length > WORLD_SCENE_MAX_ASSETS || placements.length > 4500 ||
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
      const ground = draft[0] ?? defaultWorldSceneDraft(worldId);
      return res.json({
        worldId, groundLevel: ground.groundLevel, groundTheme: ground.groundTheme,
        assets, placements, interiorItems, linkedPages, npcs: connectedNpcs,
        miniPets: await loadSceneMiniPets(db, placements.map(p => p.miniPetId)),
      });
    } catch (error) {
      console.error("[world-publication] player scene read failed", error);
      return res.status(500).json({ message: "Could not load the active world" });
    }
  });
}
