import { isKnownWorldId, type WorldId } from "./worldRegistry";
import { WORLD_SCENE_MAX_ASSETS } from "./worldSceneContent";

/** Current player-facing world status. The new scene is now always selected;
 * the lock setting controls access independently. */
export type WorldScenePublication = {
  worldId: WorldId;
  active: boolean;
  locked?: boolean;
  hasBeenLive: boolean;
  updatedAt: string | null;
  firstEnabledAt: string | null;
};

export const PLAYER_WORLD_ZOOM_MAX = 1.4; // modestly closer-out than the editor's 1.6
export const PLAYER_WORLD_ZOOM_STEP = 0.12;

export function clampPlayerWorldZoom(value: number, minZoom: number): number {
  const lower = Number.isFinite(minZoom) ? Math.min(PLAYER_WORLD_ZOOM_MAX, Math.max(0.6, minZoom)) : 0.6;
  return Math.min(PLAYER_WORLD_ZOOM_MAX, Math.max(lower, Number.isFinite(value) ? value : 1));
}

export function isPublishedWorld(worldId: string, states: readonly WorldScenePublication[]): boolean {
  return isKnownWorldId(worldId) && states.some(state => state.worldId === worldId && state.active === true);
}

export type PublicationLocation = {
  id: string; worldId: string; name: string; type: string; isShop: boolean;
};
export type PublicationNpc = { id: string; name: string; imageUrl: string | null };
type PublicationPlacement = {
  id: string; kind: string; assetId: string | null; npcId: string | null;
  legacyLocationId: string | null; isShop: boolean;
};
type PublicationAsset = { id: string; kind: string; worldId: string; name: string; imageUrl: string | null };

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
/** Use a unique same-world match only. Never silently bind an unrelated NPC
 * or let two old quest locations claim the same new NPC. */
export function resolveLegacyNpcLocation(
  worldId: string, name: string, locations: readonly PublicationLocation[],
): PublicationLocation | undefined {
  const normalized = normalizeName(name);
  if (!normalized) return;
  const candidates = locations.filter(loc => loc.worldId === worldId && loc.type === "npc");
  const exact = candidates.filter(loc => normalizeName(loc.name) === normalized);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const matches = candidates.filter(loc => {
    const other = normalizeName(loc.name);
    return other && (other.startsWith(normalized + " ") || normalized.startsWith(other + " "));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Only require a renderable saved scene and valid existing references.
 * Migration is incremental: missing old entrances, unlinked buildings/shops
 * and even a ground-only scene are legitimate. The original world remains
 * available via the reversible per-world switch. */
export function auditWorldActivation(worldId: string, input: {
  hasGround: boolean; placements: readonly PublicationPlacement[];
  assets: readonly PublicationAsset[]; npcs: readonly PublicationNpc[];
  locations: readonly PublicationLocation[];
  interiorItems?: readonly { kind: string; assetId: string | null; buildingId: string }[];
}): string[] {
  const blockers = new Set<string>();
  if (!input.hasGround) blockers.add("Save this world's ground settings first.");
  if (input.assets.length > WORLD_SCENE_MAX_ASSETS || input.placements.length > 4500 || (input.interiorItems?.length ?? 0) > 4500)
    blockers.add("This world exceeds the supported player scene limits.");
  const art = new Map(input.assets.filter(a => !!a.imageUrl).map(a => [a.id, a]));
  const npcs = new Map(input.npcs.filter(n => !!n.imageUrl).map(n => [n.id, n]));
  const locations = new Map(input.locations.map(loc => [loc.id, loc]));
  const covered = new Set<string>();
  const buildings = new Set(input.placements.filter(p => p.kind === "building").map(p => p.id));
  for (const p of input.placements) {
    if ((p.kind === "building" || p.kind === "decor") && art.get(p.assetId ?? "")?.kind !== p.kind)
      blockers.add("Some placed artwork is missing or has the wrong type.");
    if (p.legacyLocationId) {
      const old = locations.get(p.legacyLocationId);
      if (p.kind !== "building" || !old || old.type === "npc")
        blockers.add("A building has an invalid original location link.");
      else if (old.worldId === worldId) {
        if (covered.has(old.id)) blockers.add("Original location is connected more than once: " + old.name);
        covered.add(old.id);
      }
    }
    if (p.kind === "npc") {
      const npc = npcs.get(p.npcId ?? "");
      if (!npc) { blockers.add("A placed NPC is missing its catalog artwork."); continue; }
      const old = resolveLegacyNpcLocation(worldId, npc.name, input.locations);
      if (old) {
        if (covered.has(old.id)) blockers.add("Original NPC is connected more than once: " + old.name);
        covered.add(old.id);
      }
    }
  }
  for (const item of input.interiorItems ?? []) {
    if (!buildings.has(item.buildingId) || (item.kind === "decor" && art.get(item.assetId ?? "")?.kind !== "decor"))
      blockers.add("A room decoration or its parent building is missing.");
  }
  return [...blockers];
}


/** Existing game_settings keys hold reversible presentation preferences;
 * no legacy record or new schema column is needed. */
export const retiredLocationKey = (worldId: string, locationId: string) =>
  `world-scene-retired:${worldId}:${locationId}`;

export function effectiveRetiredLocations(
  worldId: string, active: boolean,
  links: readonly { id: string; kind: string; legacyLocationId: string | null; legacyWorldId: string | null }[],
  settings: readonly { key: string; value: string }[],
): string[] {
  if (!active) return [];
  const byKey = new Map(settings.map(row => [row.key, row.value]));
  return [...new Set(links.flatMap(link => {
    const locationId = link.legacyLocationId;
    return link.kind === "building" && locationId && link.legacyWorldId === worldId &&
      byKey.get(retiredLocationKey(worldId, locationId)) === link.id ? [locationId] : [];
  }))];
}
