/** Shared building occupancy is distinct from the 3-slot player allowance. */
export const PET_PARK_BUILDING_CAPACITY_MIN = 10;
export const PET_PARK_BUILDING_CAPACITY_MAX = 25;

export function isValidPetParkBuildingCapacity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= PET_PARK_BUILDING_CAPACITY_MIN && value <= PET_PARK_BUILDING_CAPACITY_MAX;
}
