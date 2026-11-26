import type { Express, RequestHandler } from "express";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import {
  worldScenePublications, worldSceneDrafts, worldSceneAssets,
  worldScenePlacements, worldSceneInteriorItems, shopItems, worldLocations,
} from "@shared/schema";
import {
  WORLD_DEFINITION_LIST, isKnownWorldId, isWorldOpenToPlayers,
} from "@shared/worlds/worldRegistry";
import type { db as database } from "../db";

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
      if (saveAndSetLive) {
        const [ground] = await db.select({ worldId: worldSceneDrafts.worldId })
          .from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId)).limit(1);
        const [placements] = await db.select({ total: count() }).from(worldScenePlacements)
          .where(eq(worldScenePlacements.worldId, worldId));
        if (!ground || !placements?.total) return res.status(409).json({
          message: "Save the world ground and place at least one item before setting it live.",
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
      const [linkedPages, npcs] = await Promise.all([
        linkedIds.length ? db.select({
          id: worldLocations.id, worldId: worldLocations.worldId, name: worldLocations.name,
          type: worldLocations.type, bgUrl: worldLocations.bgUrl,
        }).from(worldLocations).where(inArray(worldLocations.id, linkedIds)) : Promise.resolve([]),
        npcIds.length ? db.select({
          id: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
        }).from(shopItems).where(and(inArray(shopItems.id, npcIds), eq(shopItems.type, "npc"))) : Promise.resolve([]),
      ]);
      // No editor permissions or private catalog endpoints are exposed.
      // Every saved scene edit is read directly from the live source tables
      // (there is no separate published snapshot to become stale).
      res.set("Cache-Control", "private, no-store");
      return res.json({
        worldId, groundLevel: draft[0].groundLevel, groundTheme: draft[0].groundTheme,
        assets, placements, interiorItems, linkedPages, npcs,
      });
    } catch (error) {
      console.error("[world-publication] player scene read failed", error);
      return res.status(500).json({ message: "Could not load the active world" });
    }
  });
}
