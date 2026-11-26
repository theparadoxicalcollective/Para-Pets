import type { WorldGroundTheme } from "./worldGroundTheme";
import type { WorldSceneContent } from "./worldSceneContent";

/** Read-only player view of the SAME saved world the admin edits.
 * Nothing here grants player access to admin CRUD or private editor tools. */
export type WorldScenePlayerWorld = {
  worldId: string;
  groundLevel: number;
  groundTheme: WorldGroundTheme;
  content: WorldSceneContent;
  npcs: Array<{ id: string; name: string; imageUrl: string | null; specialSkill: string | null;
    legacyLocationId: string | null }>;
  legacyLocations: Array<{ id: string; worldId: string; name: string; type: string; isShop: boolean }>;
};

export type WorldScenePublicationStatus = {
  worldId: string;
  useNewWorld: boolean;
  hasSavedWorld: boolean;
  placementCount: number;
  legacyLinkCount: number;
  blockers: string[];
  warnings: string[];
  updatedAt: string | null;
};

/** When a switch is allowed, preserve older location pages until their
 * quests, shops, NPCs and player inventories have been verified in the new UI.
 * A safe publication does NOT authorize deleting these shared records. */
export function canSwitchToNewWorld(status: WorldScenePublicationStatus): boolean {
  return status.hasSavedWorld && status.placementCount > 0 &&
    status.blockers.length === 0;
}

export type AuditInput = {
  hasWorld: boolean;
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

