/** Editable, ground-level Pet Park variations, stored as existing scene items. */
export const PARK_TERRAIN_DETAIL_OPTIONS = [
  { type: "dirt_path", label: "Dirt Path", description: "Square tiles that snap into straight rows and columns", size: 200 },
  { type: "stone_patch", label: "Stones", description: "Low natural stones with mossy edges", size: 145 },
] as const;

export type ParkTerrainDetailType = typeof PARK_TERRAIN_DETAIL_OPTIONS[number]["type"] | "wildflowers" | "wild_grass";
export function parkTerrainHeightRatio(type?: string | null): number {
  return type === "dirt_path" ? 1 : 0.54;
}
export function isPaintableParkTerrainDetail(value: unknown): value is typeof PARK_TERRAIN_DETAIL_OPTIONS[number]["type"] {
  return typeof value === "string" && PARK_TERRAIN_DETAIL_OPTIONS.some(option => option.type === value);
}
// Legacy decorations remain readable/removable until the admin clears saved terrain.
export function isParkTerrainDetail(value: unknown): value is ParkTerrainDetailType {
  return isPaintableParkTerrainDetail(value) || value === "wildflowers" || value === "wild_grass";
}
