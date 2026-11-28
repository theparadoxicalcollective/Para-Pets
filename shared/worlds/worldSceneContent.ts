import type { WorldSwimScene } from "./worldSwimAreas";
import type { SceneMiniPet, MiniPetAnimation } from "../miniPet";
import type { ParkDecorEffect } from "../petParkDecorEffects";
import type { ParkShopPlacement } from "../petParkShopPlacements";
import { isValidParkDecorEffects } from "../petParkDecorEffects";
import { isParkEffect, isValidParkLightColor, type ParkEffectType } from "../petParkEffects";
import { isPaintableParkTerrainDetail } from "../petParkTerrainDetails";
import type { DecorSurface } from "../decorSurface";

export type WorldAssetKind = "decor" | "building";
export type WorldScenePlacementKind = WorldAssetKind | "effect" | "terrain" | "npc" | "mini_pet";
export type WorldSceneInteriorKind = "decor" | "effect";

export type WorldSceneAsset = {
  id: string; worldId: string; kind: WorldAssetKind; name: string;
  imageUrl: string; tapImageUrl: string | null; interiorImageUrl: string | null;
  nightInteriorImageUrl: string | null;
};

export type WorldScenePlacement = {
  id: string; worldId: string; kind: WorldScenePlacementKind;
  npcId: string | null; // Existing shared catalog NPC; never copy its media or dialogue.
  miniPetId?: string | null; idleAnimation?: MiniPetAnimation | null;
  assetId: string | null; effectType: string | null; effectColor: string | null; terrainKey: string | null;
  /** Per-placed-building room dimming, unaffected by the outdoor day/night clock. */
  interiorDarkness: number;
  interiorNightDarkness: number | null;
  xPct: number; yPct: number; size: number; flipped: boolean; rotation?: number; layer: number;
  decorEffects: ParkDecorEffect[]; isWaterSource: boolean; decorSurface: DecorSurface;
  isShop: boolean; legacyLocationId: string | null;
  shopItemIds: string[]; shopItemPlacements: ParkShopPlacement[];
};

export type WorldSceneInteriorItem = {
  id: string; worldId: string; buildingId: string;
  kind: WorldSceneInteriorKind; assetId: string | null; effectType: string | null;
  /** Optional for older saved scenes; null preserves the original lamp artwork. */
  effectColor?: string | null;
  xPct: number; yPct: number; size: number; flipped: boolean; rotation?: number;
};

export type WorldSceneContent = Partial<WorldSwimScene> & {
  miniPets?: SceneMiniPet[];
  assets: WorldSceneAsset[];
  placements: WorldScenePlacement[];
  interiorItems: WorldSceneInteriorItem[];
};

export const WORLD_TERRAIN_BRUSH_SIZES = [150, 300] as const;
export type WorldTerrainType = "dirt_path" | "stone_path" | "water_path" | "garden_plot";
export function isWorldTerrainType(value: unknown): value is WorldTerrainType {
  return isPaintableParkTerrainDetail(value);
}
export function validSceneId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}
/** Match the existing processWorldImage base64 limit; keep request bodies below Express's 50 MiB limit. */
export const WORLD_ARTWORK_MAX_BASE64 = 30 * 1024 * 1024;
export const WORLD_ARTWORK_TARGET_BYTES = 5_900_000;
export const WORLD_ARTWORK_MAX_REQUEST_DATA = 48 * 1024 * 1024;
export const WORLD_SCENE_MAX_ASSETS = 300;
export const WORLD_ARTWORK_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const artworkHeader = /^data:image\/(?:png|jpeg|webp|gif);base64,/;
export function worldArtworkError(value: unknown): "format" | "size" | null {
  if (typeof value !== "string") return "format";
  const header = artworkHeader.exec(value);
  if (!header) return "format";
  if (value.length - header[0].length > WORLD_ARTWORK_MAX_BASE64) return "size";
  const payload = value.slice(header[0].length);
  return payload.length % 4 === 0 && /^[a-zA-Z0-9+/]+={0,2}$/.test(payload) ? null : "format";
}
export function validWorldArtwork(value: unknown): value is string {
  return worldArtworkError(value) === null;
}
export function worldArtworkRequestFits(values: unknown[]): boolean {
  return values.reduce<number>((total, value) => total + (typeof value === "string" ? value.length : 0), 0)
    <= WORLD_ARTWORK_MAX_REQUEST_DATA;
}
export function validPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function validSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000;
}
export function validLayer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= -10000 && value <= 10000;
}
/** Clockwise degrees; older scenes and older clients omit rotation = 0. */
export const WORLD_SCENE_ROTATION_STEP = 5;
export function validWorldSceneRotation(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 360;
}
export function canRotateWorldSceneKind(kind: string): boolean {
  return kind === "decor" || kind === "building";
}
export function stepWorldSceneRotation(rotation: number | undefined, direction: -1 | 1): number {
  return ((rotation ?? 0) + direction * WORLD_SCENE_ROTATION_STEP + 360) % 360;
}
/** Same center pivot and flip-before-rotate ordering in editor and player. */
export function worldSceneRotationCss(rotation?: number): string {
  return rotation ? ` rotate(${rotation}deg)` : "";
}
export function worldSceneRotatedSquareExtent(size: number, rotation?: number): number {
  if (!rotation) return size;
  const radians = rotation * Math.PI / 180;
  return size * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
}
export function validPlacementTransform(v: unknown): v is {
  xPct: number; yPct: number; size: number; flipped: boolean; rotation?: number; layer: number;
} {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  return validPosition(p.xPct) && validPosition(p.yPct) && validSize(p.size) &&
    typeof p.flipped === "boolean" && validLayer(p.layer) &&
    (p.rotation === undefined || validWorldSceneRotation(p.rotation));
}
export function validDecorEffects(value: unknown): value is ParkDecorEffect[] {
  return isValidParkDecorEffects(value) &&
    value.every(effect => validEffect(effect.type));
}
export function validEffect(value: unknown): value is ParkEffectType {
  // Sleep spots are Pet Park-only interactive areas, not world scenery.
  return value !== "sleep" && isParkEffect(value);
}
/** Only standalone interior lamp effects can store a custom orb color. */
export function validInteriorEffectColor(kind: unknown, effectType: unknown, color: unknown): color is string {
  return kind === "effect" && (effectType === "lamp_light" || effectType === "colored_light") &&
    isValidParkLightColor(color);
}
export function validShopIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 40 &&
    value.every(validSceneId) && new Set(value).size === value.length;
}
export function belongsToWorld(item: { worldId: string } | null | undefined, worldId: string) {
  return !!item && item.worldId === worldId;
}

/** Terrain shares Pet Park's centered 2:1 diamond grid, not its saved items. */
export function worldTerrainCell(
  point: { xPct: number; yPct: number }, world: { width: number; height: number },
  type: WorldTerrainType, size: number,
): { xPct: number; yPct: number; key: string } | null {
  if (!validPosition(point.xPct) || !validPosition(point.yPct) ||
    !WORLD_TERRAIN_BRUSH_SIZES.includes(size as 150 | 300) || !isWorldTerrainType(type)) return null;
  const x = (point.xPct - 0.5) * world.width / size;
  const y = (point.yPct - 0.5) * world.height / size;
  const u = Math.round(x + 2 * y), v = Math.round(-x + 2 * y);
  const cx = 0.5 + (u - v) * size / (2 * world.width);
  const cy = 0.5 + (u + v) * size / (4 * world.height);
  if (cx * world.width < size / 2 || cx * world.width > world.width - size / 2 ||
      cy * world.height < size / 4 || cy * world.height > world.height - size / 4) return null;
  return { xPct: cx, yPct: cy, key: `${type}:${size}:${u}:${v}` };
}
