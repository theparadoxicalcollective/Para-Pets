/** Visual depth ordering only: existing normalized placement coordinates are unchanged. */
export type ParkDepthKind = "building" | "item" | "pet";

export type ParkDepthObject = {
  yPct: number;
  worldHeight: number;
  size: number;
  kind: ParkDepthKind;
  layer?: number;
};

/**
 * World-space visual contact point for the current sprite layouts.
 * Buildings and decor are centered on their saved positions; pets have an
 * existing translateY(-75%) body with an 80% tall animator region.
 * Using those existing transforms avoids jumping any saved artwork.
 */
export function parkGroundContactY({ yPct, worldHeight, size, kind }: ParkDepthObject): number {
  return yPct * worldHeight + (kind === "pet" ? size * (0.8 - 0.75) : size / 2);
}

/**
 * Paint nearer ground contacts over farther contacts. Existing admin layer is
 * a deliberate local depth adjustment (six world units per increment) so
 * creators can still override overlap without disabling natural Y-depth.
 * All values fit below the explicitly selected editor object's z-index.
 */
export function parkDepthIndex(object: ParkDepthObject): number {
  const offset = (object.layer ?? 0) * 6;
  return Math.round(5_000_000 + (parkGroundContactY(object) + offset) * 32);
}

export const PARK_SELECTED_DEPTH_Z = 9_000_000;
