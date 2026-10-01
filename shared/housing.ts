export const DEFAULT_OUTDOOR_PET_LIMIT = 6;
export const DEFAULT_OUTDOOR_DECOR_LIMIT = 8;

export const BUILDING_SIZE_CAPACITY = {
  small: { pets: 3, decor: 5 },
  medium: { pets: 10, decor: 15 },
  large: { pets: 15, decor: 25 },
} as const;

export type BuildingSize = keyof typeof BUILDING_SIZE_CAPACITY;
export type HouseBuildingType = "building" | "mailbox";
export type HomeSceneItemType = "decor" | "object";

export const HOUSE_BUILDING_TYPES: HouseBuildingType[] = ["building", "mailbox"];

export function isBuildingSize(value: unknown): value is BuildingSize {
  return typeof value === "string" && value in BUILDING_SIZE_CAPACITY;
}

export function isHouseBuildingType(value: unknown): value is HouseBuildingType {
  return value === "building" || value === "mailbox";
}
