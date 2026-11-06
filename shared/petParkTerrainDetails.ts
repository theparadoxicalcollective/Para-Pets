/** Editable, ground-level Pet Park variations, stored as existing scene items. */
export const PARK_TERRAIN_DETAIL_OPTIONS = [
  { type: "dirt_path", label: "Dirt Path", description: "Isometric tiles that snap along the ground grid", size: 150 },
  { type: "stone_path", label: "Stone Path", description: "Weathered stone slabs on the same snapping grid", size: 150 },
  { type: "water_path", label: "Water", description: "Connected water with irregular, softened banks", size: 150 },
  { type: "garden_plot", label: "Garden Plot", description: "Snap a garden diamond into the same isometric grid", size: 150 },
] as const;

export type ParkTerrainDetailType = typeof PARK_TERRAIN_DETAIL_OPTIONS[number]["type"] | "stone_patch" | "wildflowers" | "wild_grass";
/** All connected ground materials share the existing dirt path cell size/grid. */
export function isParkConnectedPath(type?: string | null): type is "dirt_path" | "stone_path" | "water_path" {
  return type === "dirt_path" || type === "stone_path" || type === "water_path";
}
export function parkTerrainHeightRatio(type?: string | null): number {
  return isParkConnectedPath(type) || type === "garden_plot" ? 0.5 : 0.54;
}
export function isPaintableParkTerrainDetail(value: unknown): value is typeof PARK_TERRAIN_DETAIL_OPTIONS[number]["type"] {
  return typeof value === "string" && PARK_TERRAIN_DETAIL_OPTIONS.some(option => option.type === value);
}
// Legacy decorations remain readable/removable until the admin clears saved terrain.
export function isParkTerrainDetail(value: unknown): value is ParkTerrainDetailType {
  return isPaintableParkTerrainDetail(value) || value === "stone_patch" || value === "wildflowers" || value === "wild_grass";
}
