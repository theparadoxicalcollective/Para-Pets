/** Editable, ground-level Pet Park variations, stored as existing scene items. */
export const PARK_TERRAIN_DETAIL_OPTIONS = [
  { type: "dirt_path", label: "Dirt Path", description: "Blend overlapping patches into a winding trail", size: 200 },
  { type: "stone_patch", label: "Stones", description: "Low natural stones with mossy edges", size: 145 },
  { type: "wildflowers", label: "Wildflowers", description: "Small scattered meadow flowers", size: 165 },
  { type: "wild_grass", label: "Wild Grass", description: "Tufts of grass in varied green shades", size: 160 },
] as const;

export type ParkTerrainDetailType = typeof PARK_TERRAIN_DETAIL_OPTIONS[number]["type"];
export function isParkTerrainDetail(value: unknown): value is ParkTerrainDetailType {
  return typeof value === "string" && PARK_TERRAIN_DETAIL_OPTIONS.some(option => option.type === value);
}
