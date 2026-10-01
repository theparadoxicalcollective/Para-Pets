import type { ClientWorldDestination } from "@/worlds/types";

export interface WorldLocationInteractionLocation {
  id: string;
  type: string;
  isShop: boolean;
}

export type WorldLocationInteraction =
  | ClientWorldDestination
  | { kind: "fishing" }
  | { kind: "shop" }
  | { kind: "danger-warning" }
  | { kind: "scenic" };

/**
 * Resolve what a world-location tap means without owning any UI state.
 *
 * World-specific destinations win first. Everything else follows the shared
 * Para Pets location contract so every world opens fishing, shops, danger
 * warnings and scenic locations consistently.
 */
export function resolveWorldLocationInteraction(
  location: WorldLocationInteractionLocation,
  isAdmin: boolean,
  destination?: ClientWorldDestination,
): WorldLocationInteraction {
  if (destination) return destination;

  if (location.type === "fishing" && !location.isShop) {
    return { kind: "fishing" };
  }

  if (location.isShop) {
    return { kind: "shop" };
  }

  if ((location.type === "battle" || location.type === "explore") && !isAdmin) {
    return { kind: "danger-warning" };
  }

  return { kind: "scenic" };
}

/**
 * Player battle/explore locations require an active hatched pet before their
 * normal interaction can run. Admins bypass this in WorldPage before calling
 * this check, preserving the existing admin editing/open behavior.
 */
export function worldLocationRequiresHatchedPet(
  location: WorldLocationInteractionLocation,
): boolean {
  return (
    !location.isShop
    && location.type !== "fishing"
    && (location.type === "battle" || location.type === "explore")
  );
}
