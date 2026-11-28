import { WORLD_IDS } from "@shared/worlds/worldRegistry";

/** Keep the approved teal texture unchanged. Themed variants are recolored
 * offline, so live camera movement never runs a filter or per-stamp effect. */
export const PARK_WATER_BASE = "#074653";
export const PARK_WATER_TEXTURE_URL = "/park-water-surface.webp";
export type ParkWaterStyle = "teal" | "haunted" | "volcanic";
export const PARK_WATER_APPEARANCE: Record<ParkWaterStyle, { base: string; shadow: string; textureUrl: string }> = {
  teal: { base: PARK_WATER_BASE, shadow: "rgba(5,33,38,.46)", textureUrl: PARK_WATER_TEXTURE_URL },
  haunted: { base: "#39254e", shadow: "rgba(25,13,39,.46)", textureUrl: "/park-water-haunted.webp" },
  volcanic: { base: "#641c1d", shadow: "rgba(44,12,17,.46)", textureUrl: "/park-water-volcanic.webp" },
};

/** World identity determines water color independently of the selected ground. */
export function worldWaterStyle(worldId: string): ParkWaterStyle {
  if (worldId === WORLD_IDS.hauntedWoods) return "haunted";
  if (worldId === WORLD_IDS.volcanic) return "volcanic";
  return "teal";
}

const textures = new Map<ParkWaterStyle, HTMLImageElement>();
/** Load once on demand per theme; no extra image request per stamp or raster. */
export function parkWaterImage(style: ParkWaterStyle = "teal"): HTMLImageElement {
  let texture = textures.get(style);
  if (!texture) {
    texture = new Image();
    texture.src = PARK_WATER_APPEARANCE[style].textureUrl;
    textures.set(style, texture);
  }
  return texture;
}
