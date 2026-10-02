export const PET_HOUSE_OUTDOOR_PET_BASE_SIZE = 100;
export const PET_HOUSE_INTERIOR_PET_BASE_SIZE = 100;

const DEPTH_REFERENCE_Y = 0.72;
const DEPTH_MIN_Y = 0.05;
const DEPTH_MAX_Y = 0.92;
const DEPTH_MIN_SCALE = 0.72;
const DEPTH_MAX_SCALE = 1.08;
const DEPTH_SCALE_PER_Y = 0.42;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Perspective scale for Pet House pets/decor.
 *
 * Horizontal position is intentionally not accepted here: objects at the same
 * vertical depth must render at exactly the same size anywhere across a wide
 * Home Bundle. Moving upward makes them smaller; moving downward restores a
 * little size toward the foreground.
 */
export function petHouseDepthScale(yPct: number): number {
  const y = clamp(Number.isFinite(yPct) ? yPct : DEPTH_REFERENCE_Y, DEPTH_MIN_Y, DEPTH_MAX_Y);
  return clamp(1 + (y - DEPTH_REFERENCE_Y) * DEPTH_SCALE_PER_Y, DEPTH_MIN_SCALE, DEPTH_MAX_SCALE);
}

export function petHouseDepthSize(baseSize: number, yPct: number): number {
  const safeBase = Math.max(1, Number.isFinite(baseSize) ? baseSize : 1);
  return safeBase * petHouseDepthScale(yPct);
}

export function defaultPetHouseGroundPosition(index: number): { centerX: number; centerY: number } {
  const seed = index * 137.508;
  const pseudo = (n: number) => ((Math.sin(n) * 10000) % 1 + 1) % 1;
  return {
    centerX: 20 + pseudo(seed) * 60,
    centerY: 64 + pseudo(seed + 1) * 11,
  };
}
