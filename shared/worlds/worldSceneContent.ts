import type { ParkDecorEffect } from "../petParkDecorEffects";
import type { ParkShopPlacement } from "../petParkShopPlacements";
import { isValidParkDecorEffects } from "../petParkDecorEffects";
import { isParkEffect, type ParkEffectType } from "../petParkEffects";
import { isPaintableParkTerrainDetail } from "../petParkTerrainDetails";

export type WorldAssetKind = "decor" | "building";
export type WorldScenePlacementKind = WorldAssetKind | "effect" | "terrain";
export type WorldSceneInteriorKind = "decor" | "effect";

export type WorldSceneAsset = {
  id: string; worldId: string; kind: WorldAssetKind; name: string;
  imageUrl: string; tapImageUrl: string | null; interiorImageUrl: string | null;
  nightInteriorImageUrl: string | null;
};

export type WorldScenePlacement = {
  id: string; worldId: string; kind: WorldScenePlacementKind;
  assetId: string | null; effectType: string | null; effectColor: string | null; terrainKey: string | null;
  /** Per-placed-building room dimming, unaffected by the outdoor day/night clock. */
  interiorDarkness: number;
  interiorNightDarkness: number | null;
  xPct: number; yPct: number; size: number; flipped: boolean; layer: number;
  decorEffects: ParkDecorEffect[]; isWaterSource: boolean;
  isShop: boolean; shopItemIds: string[]; shopItemPlacements: ParkShopPlacement[];
};

export type WorldSceneInteriorItem = {
  id: string; worldId: string; buildingId: string;
  kind: WorldSceneInteriorKind; assetId: string | null; effectType: string | null;
  xPct: number; yPct: number; size: number; flipped: boolean;
};

export type WorldSceneContent = {
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
export function validWorldArtwork(value: unknown): value is string {
  return typeof value === "string" && value.length < 8_000_000 &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value);
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
export function validPlacementTransform(v: unknown): v is {
  xPct: number; yPct: number; size: number; flipped: boolean; layer: number;
} {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  return validPosition(p.xPct) && validPosition(p.yPct) && validSize(p.size) &&
    typeof p.flipped === "boolean" && validLayer(p.layer);
}
export function validDecorEffects(value: unknown): value is ParkDecorEffect[] {
  return isValidParkDecorEffects(value) &&
    value.every(effect => validEffect(effect.type));
}
export function validEffect(value: unknown): value is ParkEffectType {
  // Sleep spots are Pet Park-only interactive areas, not world scenery.
  return value !== "sleep" && isParkEffect(value);
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
