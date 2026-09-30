import shopFrostpeak from "@assets/shop_frostpeak.png";
import shopSkyRealm from "@assets/shop_sky_realm.png";
import shopIsland from "@assets/shop_island.png";
import shopDesert from "@assets/shop_desert.png";
import shopEnchantedGrove from "@assets/shop_enchanted_grove_v2.png";
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
import type {
  ClientWorldDestination,
  ClientWorldModule,
  WorldPresentation,
} from "@/worlds/types";

const presentation = (
  worldId: WorldId,
  shopIcon: string,
  accent: string,
  bgGradient: string,
): WorldPresentation => ({
  worldId,
  shopIcon,
  accent,
  bgGradient,
});

export const CLIENT_WORLD_MODULES: Readonly<Record<WorldId, ClientWorldModule>> = {
  [WORLD_IDS.frostpeak]: {
    worldId: WORLD_IDS.frostpeak,
    presentation: presentation(
      WORLD_IDS.frostpeak,
      shopFrostpeak,
      "#88ccff",
      "linear-gradient(180deg, rgba(20,30,60,0.7) 0%, rgba(40,80,120,0.3) 50%, rgba(10,15,30,0.7) 100%)",
    ),
  },
  [WORLD_IDS.skyRealm]: {
    worldId: WORLD_IDS.skyRealm,
    presentation: presentation(
      WORLD_IDS.skyRealm,
      shopSkyRealm,
      "#ffd700",
      "linear-gradient(180deg, rgba(40,30,10,0.7) 0%, rgba(80,60,20,0.3) 50%, rgba(20,15,5,0.7) 100%)",
    ),
  },
  [WORLD_IDS.volcanic]: {
    worldId: WORLD_IDS.volcanic,
    presentation: VOLCANIC_PRESENTATION,
    resolveDestination: getVolcanicLocationDestination,
  },
  [WORLD_IDS.lostIsland]: {
    worldId: WORLD_IDS.lostIsland,
    presentation: presentation(
      WORLD_IDS.lostIsland,
      shopIsland,
      "#20b2aa",
      "linear-gradient(180deg, rgba(5,30,30,0.7) 0%, rgba(10,60,60,0.3) 50%, rgba(5,15,15,0.7) 100%)",
    ),
  },
  [WORLD_IDS.scorchedDesert]: {
    worldId: WORLD_IDS.scorchedDesert,
    presentation: presentation(
      WORLD_IDS.scorchedDesert,
      shopDesert,
      "#daa520",
      "linear-gradient(180deg, rgba(40,25,5,0.7) 0%, rgba(80,50,10,0.3) 50%, rgba(20,12,3,0.7) 100%)",
    ),
  },
  [WORLD_IDS.enchantedGrove]: {
    worldId: WORLD_IDS.enchantedGrove,
    presentation: presentation(
      WORLD_IDS.enchantedGrove,
      shopEnchantedGrove,
      "#7fffd4",
      "linear-gradient(180deg, rgba(5,30,20,0.7) 0%, rgba(10,60,40,0.3) 50%, rgba(5,15,10,0.7) 100%)",
    ),
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
