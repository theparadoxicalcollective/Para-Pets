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

export const HOUSE_INTERIOR_EFFECT_TYPES = ["fire", "candle_light", "warm_glow", "sparkles", "dust_motes", "soft_mist", "sleep"] as const;
export type HouseInteriorEffectType = (typeof HOUSE_INTERIOR_EFFECT_TYPES)[number];

export interface HouseInteriorEffect {
  id: string;
  type: HouseInteriorEffectType;
  x: number;
  y: number;
  size: number;
}

export const HOUSE_INTERIOR_EFFECT_MAX_COUNT = 20;
export const HOUSE_INTERIOR_EFFECT_MIN_SIZE = 4;
export const HOUSE_INTERIOR_EFFECT_MAX_SIZE = 40;
export const HOUSE_INTERIOR_DARKNESS_MIN = 0;
export const HOUSE_INTERIOR_DARKNESS_MAX = 90;

export function isHouseInteriorEffectType(value: unknown): value is HouseInteriorEffectType {
  return typeof value === "string" && (HOUSE_INTERIOR_EFFECT_TYPES as readonly string[]).includes(value);
}

export function sanitizeHouseInteriorDarkness(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(Math.max(HOUSE_INTERIOR_DARKNESS_MIN, Math.min(HOUSE_INTERIOR_DARKNESS_MAX, numeric)));
}

export function sanitizeHouseInteriorEffects(value: unknown): HouseInteriorEffect[] {
  if (!Array.isArray(value)) return [];

  const effects: HouseInteriorEffect[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;
    if (!isHouseInteriorEffectType(candidate.type)) continue;

    const xValue = Number(candidate.x);
    const yValue = Number(candidate.y);
    const sizeValue = Number(candidate.size);
    const idValue = typeof candidate.id === "string" ? candidate.id.trim().slice(0, 64) : "";

    effects.push({
      id: idValue || `effect-${effects.length + 1}`,
      type: candidate.type,
      x: Math.max(0, Math.min(1, Number.isFinite(xValue) ? xValue : 0.5)),
      y: Math.max(0, Math.min(1, Number.isFinite(yValue) ? yValue : 0.5)),
      size: Math.max(
        HOUSE_INTERIOR_EFFECT_MIN_SIZE,
        Math.min(HOUSE_INTERIOR_EFFECT_MAX_SIZE, Number.isFinite(sizeValue) ? sizeValue : 12),
      ),
    });

    if (effects.length >= HOUSE_INTERIOR_EFFECT_MAX_COUNT) break;
  }

  return effects;
}

export function isHouseInteriorSleepPosition(
  effects: readonly HouseInteriorEffect[],
  xPct: number,
  yPct: number,
  imageAspect: number,
): boolean {
  if (!Number.isFinite(imageAspect) || imageAspect <= 0) return false;
  const safeX = Number.isFinite(xPct) ? xPct : 0.5;
  const safeY = Number.isFinite(yPct) ? yPct : 0.5;

  return effects.some(effect => {
    if (effect.type !== "sleep") return false;
    // Effect size is stored as a percentage of scene height. Convert that
    // square footprint into image-X percentage so hit testing matches the
    // exact admin/player rendering on every viewport size.
    const halfHeightPct = effect.size / 200;
    const halfWidthPct = halfHeightPct / imageAspect;
    return Math.abs(safeX - effect.x) <= halfWidthPct
      && Math.abs(safeY - effect.y) <= halfHeightPct;
  });
}

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
