import { isKnownWorldId, isWorldOpenToPlayers, WORLD_IDS, type WorldId } from "./worldRegistry";

/** Original maps that still contain gameplay. Keep their IDs and page handlers
 * intact, but don't make these alternate maps part of ordinary navigation. */
export function hasRetainedLegacyWorld(worldId: string): boolean {
  return worldId === WORLD_IDS.elysianBayou || worldId === WORLD_IDS.hauntedWoods || worldId === WORLD_IDS.volcanic;
}

export const worldLockKey = (worldId: WorldId) => `world-locked:${worldId}`;

export function defaultWorldLocked(worldId: string): boolean {
  // Haunted Woods has been public on the world map since its release.
  return worldId !== WORLD_IDS.hauntedWoods && !isWorldOpenToPlayers(worldId);
}

export function effectiveWorldLocked(worldId: string, savedValue?: string): boolean {
  if (!isKnownWorldId(worldId)) return true;
  if (savedValue === "true") return true;
  if (savedValue === "false") return false;
  return defaultWorldLocked(worldId);
}

/** Moderators have player visibility; only game administrators preview locks. */
export function canPreviewLockedWorld(viewer?: { isAdmin?: boolean; isModerator?: boolean } | null): boolean {
  return viewer?.isAdmin === true;
}

export function worldLockedForPlayer(
  worldId: string, states: readonly { worldId: string; locked?: boolean }[],
): boolean {
  return states.find(state => state.worldId === worldId)?.locked ?? defaultWorldLocked(worldId);
}

// Old pages are deliberately reachable by a specific link or existing gameplay
// intent. Only administrators may deliberately open an entire original map.
export function shouldUseLegacyWorld(worldId: string, params: URLSearchParams, admin: boolean): boolean {
  if (!isKnownWorldId(worldId)) return admin; // preserve existing custom admin map entries
  if (!hasRetainedLegacyWorld(worldId)) return false;
  if (admin && params.get("legacyView") === "1") return true;
  return !!params.get("legacyLocationId") || !!params.get("questNpc") ||
    ["fishHint", "shopHint", "moltenHint", "openFishMarket", "jansonHint"].some(name => params.has(name));
}
