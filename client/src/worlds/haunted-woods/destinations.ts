import { LEGACY_SOUL_POND_LOCATION_ID } from "@shared/worlds/hauntedWoods";
import type { ClientWorldDestination } from "@/worlds/types";

const HAUNTED_WOODS_LOCATION_DESTINATIONS: Readonly<Record<string, ClientWorldDestination>> = {
  // Preserve the legacy Soul Pond placeholder as a scenic location. Keeping
  // this in the Haunted Woods module prevents its world-specific ID from
  // leaking back into the shared WorldPage interaction flow.
  [LEGACY_SOUL_POND_LOCATION_ID]: {
    kind: "scenic",
  },
};

export function getHauntedWoodsLocationDestination(
  locationId: string,
): ClientWorldDestination | undefined {
  return HAUNTED_WOODS_LOCATION_DESTINATIONS[locationId];
}
