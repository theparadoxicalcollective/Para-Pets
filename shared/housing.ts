export const DEFAULT_OUTDOOR_PET_LIMIT = 6;
export const DEFAULT_OUTDOOR_DECOR_LIMIT = 8;

export const HOME_SCENE_PLAYER_SIZE_DECREASE_STEP = 25;
export const HOME_SCENE_PLAYER_SIZE_INCREASE_STEP = 10;
export const HOME_SCENE_PLAYER_MIN_SCALE = 0.5;
export const HOME_SCENE_PLAYER_MAX_ABOVE_ADMIN = 10;

export function clampHomeScenePlayerSize(baseSize: number, requestedSize: number): number {
  const safeBase = Math.max(60, Math.min(500, Math.round(Number.isFinite(baseSize) ? baseSize : 250)));
  const min = Math.max(40, Math.round(safeBase * HOME_SCENE_PLAYER_MIN_SCALE));
  const max = Math.min(510, safeBase + HOME_SCENE_PLAYER_MAX_ABOVE_ADMIN);
  const requested = Math.round(Number.isFinite(requestedSize) ? requestedSize : safeBase);
  return Math.max(min, Math.min(max, requested));
}

export const PET_HOUSE_PLAYER_SCALE_DECREASE_STEP = 15;
export const PET_HOUSE_PLAYER_SCALE_INCREASE_STEP = 10;
export const PET_HOUSE_PLAYER_MIN_SCALE = 55;
export const PET_HOUSE_PLAYER_MAX_SCALE = 140;

export function clampPetHousePlayerScale(requestedScale: number): number {
  const requested = Math.round(Number.isFinite(requestedScale) ? requestedScale : 100);
  return Math.max(PET_HOUSE_PLAYER_MIN_SCALE, Math.min(PET_HOUSE_PLAYER_MAX_SCALE, requested));
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
