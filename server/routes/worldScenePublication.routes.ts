import type { Express, Request, RequestHandler } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  shopItems, worldLocations, worldSceneAssets, worldSceneDrafts,
  worldSceneInteriorItems, worldScenePlacements, worldScenePublications,
} from "@shared/schema";
import {
  WORLD_DEFINITION_LIST, isKnownWorldId, isWorldOpenToPlayers, type WorldId,
} from "@shared/worlds/worldRegistry";
import { requireAuthenticated } from "../auth";
import type { WorldScenePlayerSnapshot, WorldScenePublicationStatus } from "@shared/worlds/worldScenePublication";
import type { db as database } from "../db";

type Store = typeof database;
const playable = (worldId: string): worldId is WorldId => isKnownWorldId(worldId);
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

type AuditInput = {
  hasDraft: boolean;
  placements: Array<{
    id: string; kind: string; assetId: string | null; npcId: string | null;
    legacyLocationId: string | null; isShop: boolean;
  }>;
  assets: Array<{ id: string; imageUrl: string }>;
  npcs: Array<{ id: string; name: string; imageUrl: string | null }>;
  locations: Array<{ id: string; worldId: string; name: string; type: string; isShop: boolean }>;
};

export function auditWorldPublication(worldId: string, input: AuditInput) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const validAssets = new Set(input.assets.filter(a => !!a.imageUrl).map(a => a.id));
  const catalog = new Map(input.npcs.filter(n => !!n.imageUrl).map(n => [n.id, n]));
  const oldPages = new Map(input.locations.map(page => [page.id, page]));
  const linked = new Set<string>();
  const npcNames = new Set<string>();
  if (!input.hasDraft) blockers.push("Save the new world's ground settings first");
  if (!input.placements.length) blockers.push("Place at least one new-world object before switching players");
  for (const object of input.placements) {
    if ((object.kind === "building" || object.kind === "decor") &&
        (!object.assetId || !validAssets.has(object.assetId))) {
      blockers.push("Some placed artwork is missing from this world's asset library");
    }
    if (object.legacyLocationId) {
      if (!oldPages.has(object.legacyLocationId))
        blockers.push("A building references a legacy page that no longer exists");
      else linked.add(object.legacyLocationId);
    }
    if (object.kind === "building" && object.isShop && !object.legacyLocationId) {
      blockers.push("Link each shop building to its original shop page before switching players");
    }
    if (object.kind === "npc") {
      const npc = object.npcId ? catalog.get(object.npcId) : undefined;
      if (!npc) blockers.push("An NPC is missing from the shared NPC catalog");
      else npcNames.add(npc.name.trim().toLocaleLowerCase());
    }
  }
  // During migration, the old game logic stays authoritative for quests,
  // fishing, battles, NPC dialogues and shop transactions. Never silently
  // replace these with decorative artwork lacking a functional old-world link.
  const missing = input.locations.filter(location => location.worldId === worldId &&
    (location.type === "npc"
      ? !npcNames.has(location.name.trim().toLocaleLowerCase())
      : (location.isShop || ["quest", "fishing", "battle", "mini_game", "explore"].includes(location.type))
        && !linked.has(location.id)));
  if (missing.length) blockers.push(
    `${missing.length} original interactive location(s) still need matching buildings or NPCs in the new world`);
  if (linked.size) warnings.push(
    `${linked.size} original page link(s) still in use — keep legacy content until they are migrated`);
  if (npcNames.size) warnings.push("Verify NPC dialogue and quest pointers on a real phone before retiring original locations");
  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    legacyLinkCount: linked.size,
  };
}

async function inspect(db: Store, worldId: WorldId): Promise<WorldScenePublicationStatus> {
  const [pub, draft, placements, assets, npcs, locations] = await Promise.all([
    db.select().from(worldScenePublications).where(eq(worldScenePublications.worldId, worldId)).limit(1),
    db.select().from(worldSceneDrafts).where(eq(worldSceneDrafts.worldId, worldId)).limit(1),
    db.select({
      id: worldScenePlacements.id, kind: worldScenePlacements.kind, assetId: worldScenePlacements.assetId,
      npcId: worldScenePlacements.npcId, legacyLocationId: worldScenePlacements.legacyLocationId,
      isShop: worldScenePlacements.isShop,
    }).from(worldScenePlacements).where(eq(worldScenePlacements.worldId, worldId)),
    db.select({ id: worldSceneAssets.id, imageUrl: worldSceneAssets.imageUrl })
      .from(worldSceneAssets).where(eq(worldSceneAssets.worldId, worldId)),
    db.select({ id: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl })
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
