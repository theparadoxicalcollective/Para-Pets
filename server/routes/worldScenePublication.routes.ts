import type { Express, Request, RequestHandler } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  shopItems, worldLocations, worldSceneAssets, worldSceneDrafts,
  worldSceneInteriorItems, worldScenePlacements, worldScenePublications,
} from "@shared/schema";
import {
  WORLD_DEFINITION_LIST, isKnownWorldId, isWorldOpenToPlayers, type WorldId,
} from "@shared/worlds/worldRegistry";
import { requireAuthenticated } from "../auth";
import { auditWorldPublication, type WorldScenePlayerSnapshot, type WorldScenePublicationStatus } from "@shared/worlds/worldScenePublication";
import type { db as database } from "../db";

type Store = typeof database;
const playable = (worldId: string): worldId is WorldId => isKnownWorldId(worldId);
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

async function inspect(db: Store, worldId: WorldId): Promise<WorldScenePublicationStatus> {
  const [pub, draft, placements, assets, npcs, locations] = await Promise.all([
    db.select().from(worldScenePublications).where(eq(worldScenePublications.worldId, worldId)).limit(1),
    db.select().from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId)).limit(1),
    db.select({
      id: worldScenePlacements.id, kind: worldScenePlacements.kind, assetId: worldScenePlacements.assetId,
      npcId: worldScenePlacements.npcId, legacyLocationId: worldScenePlacements.legacyLocationId,
      isShop: worldScenePlacements.isShop,
    }).from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId)),
    // Status polling happens on the World Map. Avoid loading large base64
    // artwork eight times; a lightweight existence flag is sufficient here.
    db.select({ id: worldSceneAssets.id,
      imageUrl: sql<string>`CASE WHEN length(${worldSceneAssets.imageUrl}) > 0 THEN 'ready' ELSE '' END` })
      .from(worldSceneAssets).where(eq(worldSceneAssets.worldId, worldId)),
    db.select({ id: shopItems.id, name: shopItems.name,
      imageUrl: sql<string>`CASE WHEN length(${shopItems.imageUrl}) > 0 THEN 'ready' ELSE '' END` })
      .from(shopItems).where(and(eq(shopItems.type, "npc"), eq(shopItems.worldId, "__npc_catalog__"))),
    db.select({
      id: worldLocations.id, worldId: worldLocations.worldId, name: worldLocations.name,
      type: worldLocations.type, isShop: worldLocations.isShop,
    }).from(worldLocations),
  ]);
  const audit = auditWorldPublication(worldId, {
    hasDraft: !!draft.length, placements, assets, npcs, locations,
  });
  return {
    worldId, useNewWorld: pub[0]?.useNewWorld === true,
    hasPublishedSnapshot: !!pub[0]?.snapshot, hasSavedDraft: !!draft.length,
    placementCount: placements.length, legacyLinkCount: audit.legacyLinkCount,
    blockers: audit.blockers, warnings: audit.warnings,
    updatedAt: pub[0]?.updatedAt?.toISOString() ?? null,
  };
}

/** A published snapshot is deliberately independent of the editable scene.
 * No legacy map, NPC, quest, shop or garden data is deleted by this module. */
export function registerWorldScenePublicationRoutes(
  app: Express, { db, isAdmin }: { db: Store; isAdmin: RequestHandler },
): void {
  app.get("/api/admin/world-editor/publications", isAdmin, async (_req, res) => {
    try {
      const statuses = await Promise.all(WORLD_DEFINITION_LIST.map(world => inspect(db, world.id)));
      return res.json(Object.fromEntries(statuses.map(status => [status.worldId, status])));
    } catch (error) {
      console.error("[world-publication] status read failed", error);
      return res.status(500).json({ message: "Unable to load world switches" });
    }
  });

  app.get("/api/world-scene/:worldId/status", requireAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (!playable(worldId)) return res.status(404).json({ message: "Unknown world" });
    try {
      const [saved] = await db.select({
        useNewWorld: worldScenePublications.useNewWorld,
      }).from(worldScenePublications).where(eq(worldScenePublications.worldId, worldId)).limit(1);
      return res.json({ worldId, useNewWorld: saved?.useNewWorld === true });
    } catch (error) {
      console.error("[world-publication] player status failed", error);
      return res.status(503).json({ message: "World availability could not be checked" });
    }
  });

  app.get("/api/world-scene/:worldId/player", requireAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (!playable(worldId)) return res.status(404).json({ message: "Unknown world" });
    const user = req.user as { isAdmin?: boolean; isModerator?: boolean };
    if (!user?.isAdmin && !user?.isModerator &&
        !isWorldOpenToPlayers(worldId) && worldId !== "haunted_woods") {
      return res.status(403).json({ message: "World is not yet open to players" });
    }
    try {
      const [published] = await db.select().from(worldScenePublications)
        .where(eq(worldScenePublications.worldId, worldId)).limit(1);
      if (!published?.useNewWorld || !published.snapshot) {
        return res.status(404).json({ message: "This world still uses its original presentation" });
      }
      res.setHeader("Cache-Control", "no-store");
      return res.json(published.snapshot as WorldScenePlayerSnapshot);
    } catch (error) {
      console.error("[world-publication] player scene failed", error);
      return res.status(500).json({ message: "New world could not be loaded" });
    }
  });

  app.patch("/api/admin/world-editor/:worldId/player-view", isAdmin, async (req: Request, res) => {
    const worldId = req.params.worldId;
    if (!playable(worldId)) return res.status(404).json({ message: "Unknown world" });
    if (typeof req.body?.useNewWorld !== "boolean") {
      return res.status(400).json({ message: "Choose the original or new player world" });
    }
    try {
      if (!req.body.useNewWorld) {
        await db.insert(worldScenePublications).values({ worldId, useNewWorld: false })
          .onConflictDoUpdate({ target: worldScenePublications.worldId,
            set: { useNewWorld: false, updatedAt: new Date() } });
        return res.json(await inspect(db, worldId));
      }
      // Transactionally build the entire release from one consistent editor
      // state. Do not publish on validation failure, and never delete legacy.
      await db.transaction(async tx => {
        const [[draft], assets, placements, interiorItems, npcs, locations] = await Promise.all([
          tx.select().from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId)).limit(1),
          tx.select().from(worldSceneAssets).where(eq(worldSceneAssets.worldId, worldId))
            .orderBy(asc(worldSceneAssets.createdAt)),
          tx.select().from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId))
            .orderBy(asc(worldScenePlacements.createdAt)),
          tx.select().from(worldSceneInteriorItems).where(eq(worldSceneInteriorItems.worldId, worldId))
            .orderBy(asc(worldSceneInteriorItems.createdAt)),
          tx.select({
            id: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
            specialSkill: shopItems.specialSkill,
          }).from(shopItems).where(and(eq(shopItems.type, "npc"), eq(shopItems.worldId, "__npc_catalog__"))),
          tx.select({
            id: worldLocations.id, worldId: worldLocations.worldId, name: worldLocations.name,
            type: worldLocations.type, isShop: worldLocations.isShop,
          }).from(worldLocations),
        ]);
        const audit = auditWorldPublication(worldId, {
          hasDraft: !!draft, assets, placements, npcs, locations,
        });
        if (audit.blockers.length) {
          throw new PublicationNotReady(audit.blockers);
        }
        const snapshot: WorldScenePlayerSnapshot = {
          worldId, groundLevel: draft.groundLevel,
          groundTheme: draft.groundTheme as WorldScenePlayerSnapshot["groundTheme"],
          content: { assets, placements, interiorItems },
          npcs: npcs.filter(n => !!n.imageUrl).map(n => ({
            ...n,
            legacyLocationId: locations.find(loc => loc.worldId === worldId &&
              loc.type === "npc" && sameName(loc.name, n.name))?.id ?? null,
          })),
          legacyLocations: locations.filter(loc => placements.some(p => p.legacyLocationId === loc.id)),
          publishedAt: new Date().toISOString(),
        };
        await tx.insert(worldScenePublications).values({ worldId, useNewWorld: true, snapshot })
          .onConflictDoUpdate({ target: worldScenePublications.worldId,
            set: { useNewWorld: true, snapshot, updatedAt: new Date() } });
      });
      return res.json(await inspect(db, worldId));
    } catch (error) {
      if (error instanceof PublicationNotReady) {
        return res.status(409).json({ message: "New world is not ready for players", blockers: error.blockers });
      }
      console.error("[world-publication] switch failed", error);
      return res.status(500).json({ message: "Unable to switch this world" });
    }
  });
}

class PublicationNotReady extends Error {
  constructor(public readonly blockers: string[]) {
    super("New world is missing required player connections");
  }
}
