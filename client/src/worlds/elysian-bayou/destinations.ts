import { ELYSIAN_BAYOU_LOCATION_IDS } from "@shared/worlds/elysianBayou";
import type { ClientWorldDestination } from "@/worlds/types";

const ELYSIAN_BAYOU_LOCATION_DESTINATIONS: Readonly<Record<string, ClientWorldDestination>> = {
  [ELYSIAN_BAYOU_LOCATION_IDS.clearing]: {
    kind: "route",
    route: "/explore/elysian-bayou-clearing",
  },
};

export function getElysianBayouLocationDestination(
  locationId: string,
): ClientWorldDestination | undefined {
  return ELYSIAN_BAYOU_LOCATION_DESTINATIONS[locationId];
}
