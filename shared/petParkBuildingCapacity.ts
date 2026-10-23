/** Building-wide occupancy is independent of the three deposit slots per player. */
export const PET_PARK_BUILDING_CAPACITY_MIN = 1;
export const PET_PARK_BUILDING_CAPACITY_MAX = 100;

export function isValidPetParkBuildingCapacity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= PET_PARK_BUILDING_CAPACITY_MIN && value <= PET_PARK_BUILDING_CAPACITY_MAX;
}
