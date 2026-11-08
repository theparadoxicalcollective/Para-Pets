import { HOUSE_INTERIOR_DARKNESS_MAX, HOUSE_INTERIOR_DARKNESS_MIN } from "./housing";

/**
 * Blend the two admin settings into ONE already-existing darkness mask.
 * A null night value leaves older rooms visually unchanged; nighttime
 * cannot become brighter than the configured daytime dimming.
 */
export function parkInteriorDarkness(
  daytime: number,
  peakNight: number | null | undefined,
  nightStrength: number,
): number {
  const day = Number.isFinite(daytime)
    ? Math.max(HOUSE_INTERIOR_DARKNESS_MIN, Math.min(HOUSE_INTERIOR_DARKNESS_MAX, daytime))
    : 35;
  const night = typeof peakNight === "number" && Number.isFinite(peakNight)
    ? Math.max(day, Math.min(HOUSE_INTERIOR_DARKNESS_MAX, peakNight)) : day;
  const progress = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  return day + (night - day) * progress;
}
