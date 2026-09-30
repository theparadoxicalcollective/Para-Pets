export const WORLD_IDS = {
  frostpeak: "snowy_mountain",
  skyRealm: "sky_realm",
  volcanic: "volcanic",
  lostIsland: "island",
  scorchedDesert: "desert",
  enchantedGrove: "enchanted_grove",
  hauntedWoods: "haunted_woods",
  elysianBayou: "swamp",
} as const;

export type WorldId = typeof WORLD_IDS[keyof typeof WORLD_IDS];
export type WorldAccess = "public" | "staff";

export interface WorldDefinition {
  id: WorldId;
  /**
   * Existing fallback display name used when the database has not supplied an
   * override. This is intentionally not a source of presentation styling.
   */
  defaultName: string;
  /**
   * Stable source-code namespace for future per-world modules.
   * This never changes route ids, database ids, or player-facing URLs.
   */
  moduleKey: string;
  /**
   * Existing world access rule. Admins/moderators may still enter every world.
   */
  access: WorldAccess;
  /**
   * Existing authored map height in the shared 1080px world-map coordinate
   * space. These values must remain stable because admin placements are stored
   * as percentages of the authored map.
   */
  fixedMapHeight: number;
}

export const WORLD_DEFINITIONS: Readonly<Record<WorldId, WorldDefinition>> = {
  [WORLD_IDS.frostpeak]: {
    id: WORLD_IDS.frostpeak,
    defaultName: "Frostpeak",
    moduleKey: "frostpeak",
    access: "staff",
    fixedMapHeight: 1980,
  },
  [WORLD_IDS.skyRealm]: {
    id: WORLD_IDS.skyRealm,
    defaultName: "Sky Realm",
    moduleKey: "sky-realm",
    access: "staff",
    fixedMapHeight: 1980,
  },
  [WORLD_IDS.volcanic]: {
    id: WORLD_IDS.volcanic,
    defaultName: "Volcanic Isle",
    moduleKey: "volcanic",
    access: "public",
    fixedMapHeight: 1440,
  },
  [WORLD_IDS.lostIsland]: {
    id: WORLD_IDS.lostIsland,
    defaultName: "The Lost Island",
    moduleKey: "lost-island",
    access: "staff",
    fixedMapHeight: 1980,
  },
  [WORLD_IDS.scorchedDesert]: {
    id: WORLD_IDS.scorchedDesert,
    defaultName: "Scorched Desert",
    moduleKey: "scorched-desert",
    access: "staff",
    fixedMapHeight: 1980,
  },
  [WORLD_IDS.enchantedGrove]: {
    id: WORLD_IDS.enchantedGrove,
    defaultName: "Enchanted Grove",
    moduleKey: "enchanted-grove",
    access: "staff",
    fixedMapHeight: 1980,
  },
  [WORLD_IDS.hauntedWoods]: {
    id: WORLD_IDS.hauntedWoods,
    defaultName: "Haunted Woods",
    moduleKey: "haunted-woods",
    access: "staff",
    fixedMapHeight: 1440,
  },
  [WORLD_IDS.elysianBayou]: {
    id: WORLD_IDS.elysianBayou,
    defaultName: "Elysian Swamplands",
    moduleKey: "elysian-bayou",
    access: "public",
    fixedMapHeight: 1621,
  },
};

export const WORLD_DEFINITION_LIST: readonly WorldDefinition[] =
  Object.values(WORLD_DEFINITIONS);

export function isKnownWorldId(worldId: string): worldId is WorldId {
  return Object.prototype.hasOwnProperty.call(WORLD_DEFINITIONS, worldId);
}

export function getWorldDefinition(worldId: string): WorldDefinition | undefined {
  return isKnownWorldId(worldId) ? WORLD_DEFINITIONS[worldId] : undefined;
}

export function isWorldOpenToPlayers(worldId: string): boolean {
  return getWorldDefinition(worldId)?.access === "public";
}
