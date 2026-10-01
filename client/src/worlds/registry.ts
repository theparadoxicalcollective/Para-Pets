import {
  WORLD_IDS,
  isKnownWorldId,
  type WorldId,
} from "@shared/worlds/worldRegistry";
import { HAUNTED_WOODS_PRESENTATION } from "@/worlds/haunted-woods/presentation";
import { VOLCANIC_PRESENTATION } from "@/worlds/volcanic/presentation";
import { getVolcanicLocationDestination } from "@/worlds/volcanic/destinations";
import { ELYSIAN_BAYOU_PRESENTATION } from "@/worlds/elysian-bayou/presentation";
import { getElysianBayouLocationDestination } from "@/worlds/elysian-bayou/destinations";
import { FROSTPEAK_PRESENTATION } from "@/worlds/frostpeak/presentation";
import { SKY_REALM_PRESENTATION } from "@/worlds/sky-realm/presentation";
import { LOST_ISLAND_PRESENTATION } from "@/worlds/lost-island/presentation";
import { SCORCHED_DESERT_PRESENTATION } from "@/worlds/scorched-desert/presentation";
import { ENCHANTED_GROVE_PRESENTATION } from "@/worlds/enchanted-grove/presentation";
import type {
  ClientWorldDestination,
  ClientWorldModule
} from "@/worlds/types";

export const CLIENT_WORLD_MODULES: Readonly<Record<WorldId, ClientWorldModule>> = {
  [WORLD_IDS.frostpeak]: {
    worldId: WORLD_IDS.frostpeak,
    presentation: FROSTPEAK_PRESENTATION,
  },
  [WORLD_IDS.skyRealm]: {
    worldId: WORLD_IDS.skyRealm,
    presentation: SKY_REALM_PRESENTATION,
  },
  [WORLD_IDS.volcanic]: {
    worldId: WORLD_IDS.volcanic,
    presentation: VOLCANIC_PRESENTATION,
    resolveDestination: getVolcanicLocationDestination,
  },
  [WORLD_IDS.lostIsland]: {
    worldId: WORLD_IDS.lostIsland,
    presentation: LOST_ISLAND_PRESENTATION,
  },
  [WORLD_IDS.scorchedDesert]: {
    worldId: WORLD_IDS.scorchedDesert,
    presentation: SCORCHED_DESERT_PRESENTATION,
  },
  [WORLD_IDS.enchantedGrove]: {
    worldId: WORLD_IDS.enchantedGrove,
    presentation: ENCHANTED_GROVE_PRESENTATION,
  },
  [WORLD_IDS.hauntedWoods]: {
    worldId: WORLD_IDS.hauntedWoods,
    presentation: HAUNTED_WOODS_PRESENTATION,
  },
  [WORLD_IDS.elysianBayou]: {
    worldId: WORLD_IDS.elysianBayou,
    presentation: ELYSIAN_BAYOU_PRESENTATION,
    resolveDestination: getElysianBayouLocationDestination,
  },
};

export function getClientWorldModule(worldId: string): ClientWorldModule | undefined {
  return isKnownWorldId(worldId) ? CLIENT_WORLD_MODULES[worldId] : undefined;
}

export function resolveClientWorldDestination(
  worldId: string,
  locationId: string,
): ClientWorldDestination | undefined {
  return getClientWorldModule(worldId)?.resolveDestination?.(locationId);
}
