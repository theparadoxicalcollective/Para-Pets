import {
  getHouseBuildingPetLimit,
  getHouseOutdoorPetLimit,
  type BuildingSize,
  type HouseBuildingType,
} from "@shared/housing";

export interface PetHomeCapacityPosition {
  inventoryId: string;
  location?: string | null;
}

export interface PetHomeCapacityBuilding {
  id: string;
  // Storage rows expose these text columns as generic strings. The shared
  // capacity resolvers validate/narrow them before using them.
  size?: unknown;
  maxPets?: unknown;
  buildingType?: unknown;
}

export interface PetHomeCapacityBundle {
  maxOutdoorPets?: number | null;
  buildings?: readonly PetHomeCapacityBuilding[];
}

/**
 * Returns placement rows that exceed the currently active Home's pet capacity.
 *
 * Callers pass positions in preservation order. The first N pets for a scene are
 * kept; later overflow rows are returned so they can be removed from the Home
 * scene (the pet itself remains in normal player inventory).
 */
export function getPetHomeOverflowInventoryIds(
  positions: readonly PetHomeCapacityPosition[],
  bundle: PetHomeCapacityBundle | null | undefined,
): string[] {
  const buildings = new Map((bundle?.buildings ?? []).map(building => [building.id, building]));
  const sceneCounts = new Map<string, number>();
  const overflow: string[] = [];

  for (const position of positions) {
    const location = position.location && position.location !== "outside"
      ? position.location
      : "outside";

    let limit: number;
    if (location === "outside") {
      limit = getHouseOutdoorPetLimit(bundle);
    } else {
      const building = buildings.get(location);
      if (!building || building.buildingType === "mailbox") {
        overflow.push(position.inventoryId);
        continue;
      }
      limit = getHouseBuildingPetLimit(building);
    }

    const current = sceneCounts.get(location) ?? 0;
    if (current >= limit) {
      overflow.push(position.inventoryId);
      continue;
    }
    sceneCounts.set(location, current + 1);
  }

  return overflow;
}
