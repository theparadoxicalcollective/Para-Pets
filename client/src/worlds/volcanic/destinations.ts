import { VOLCANIC_LOCATION_IDS } from "@shared/worlds/volcanic";

export type VolcanicLocationDestination =
  | { kind: "route"; route: "/games/molten-blocks" | "/games/lava-crawl" }
  | { kind: "notice"; title: "Coming soon!"; description: "The cooking mini-game is being prepared." };

const VOLCANIC_LOCATION_DESTINATIONS: Readonly<Record<string, VolcanicLocationDestination>> = {
  [VOLCANIC_LOCATION_IDS.moltenBastion]: {
    kind: "route",
    route: "/games/molten-blocks",
  },
  [VOLCANIC_LOCATION_IDS.lavaCrawl]: {
    kind: "route",
    route: "/games/lava-crawl",
  },
  [VOLCANIC_LOCATION_IDS.emberKitchen]: {
    kind: "notice",
    title: "Coming soon!",
    description: "The cooking mini-game is being prepared.",
  },
};

export function getVolcanicLocationDestination(
  locationId: string,
): VolcanicLocationDestination | undefined {
  return VOLCANIC_LOCATION_DESTINATIONS[locationId];
}
