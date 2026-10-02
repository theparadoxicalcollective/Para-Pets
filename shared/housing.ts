export const DEFAULT_OUTDOOR_PET_LIMIT = 6;
export const DEFAULT_OUTDOOR_DECOR_LIMIT = 8;

export const HOME_SCENE_PLAYER_SIZE_STEP = 10;
export const HOME_SCENE_PLAYER_MIN_SCALE = 0.75;
export const HOME_SCENE_PLAYER_MAX_SCALE = 1.25;

export function clampHomeScenePlayerSize(baseSize: number, requestedSize: number): number {
  const safeBase = Math.max(60, Math.min(500, Math.round(Number.isFinite(baseSize) ? baseSize : 250)));
  const min = Math.max(60, Math.round(safeBase * HOME_SCENE_PLAYER_MIN_SCALE));
  const max = Math.min(500, Math.round(safeBase * HOME_SCENE_PLAYER_MAX_SCALE));
  const requested = Math.round(Number.isFinite(requestedSize) ? requestedSize : safeBase);
  return Math.max(min, Math.min(max, requested));
}

export const BUILDING_SIZE_CAPACITY = {
  small: { pets: 3, decor: 5 },
  medium: { pets: 10, decor: 15 },
  large: { pets: 15, decor: 25 },
} as const;

export type BuildingSize = keyof typeof BUILDING_SIZE_CAPACITY;
export type HouseBuildingType = "building" | "mailbox";
export type HomeSceneItemType = "decor" | "object";

export function homeSceneItemCountsTowardDecorLimit(type: HomeSceneItemType): boolean {
  return type === "decor";
}

export const HOUSE_BUILDING_TYPES: HouseBuildingType[] = ["building", "mailbox"];

export function isBuildingSize(value: unknown): value is BuildingSize {
  return typeof value === "string" && value in BUILDING_SIZE_CAPACITY;
}

export function isHouseBuildingType(value: unknown): value is HouseBuildingType {
  return value === "building" || value === "mailbox";
}
