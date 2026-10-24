/**
 * Expandable grassy Pet Park. World units are scene coordinates, never phone
 * pixels or a reference image. All ground tiers share a single fixed zoom.
 */
export const PET_PARK_GROUND_SIZES = [
  { width: 1800, height: 2700 },
  { width: 2700, height: 4050 },
  { width: 4050, height: 6075 },
  { width: 5400, height: 8100 },
] as const;

export const PET_PARK_DEFAULT_GROUND_LEVEL = 1;
export const PET_PARK_MAX_GROUND_LEVEL = PET_PARK_GROUND_SIZES.length;

export function isParkGroundLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= PET_PARK_DEFAULT_GROUND_LEVEL && value <= PET_PARK_MAX_GROUND_LEVEL;
}

export function parkGroundSize(level: number): { width: number; height: number } {
  return PET_PARK_GROUND_SIZES[isParkGroundLevel(level) ? level - 1 : 0];
}

/**
 * Preserve an existing object's exact offset in world units from the center
 * when the admin expands the grass outwards on all sides.
 */
export function parkExpandedCoordinate(value: number, oldExtent: number, newExtent: number): number {
  return 0.5 + (value - 0.5) * oldExtent / newExtent;
}

export function parkExpandPoint(
  point: { xPct: number; yPct: number }, oldLevel: number, newLevel: number,
): { xPct: number; yPct: number } {
  const oldSize = parkGroundSize(oldLevel);
  const nextSize = parkGroundSize(newLevel);
  return {
    xPct: parkExpandedCoordinate(point.xPct, oldSize.width, nextSize.width),
    yPct: parkExpandedCoordinate(point.yPct, oldSize.height, nextSize.height),
  };
}
