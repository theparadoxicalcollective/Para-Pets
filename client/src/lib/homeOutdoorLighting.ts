import type { HomeOutdoorLightingMode } from "@shared/housing";
import { localClockMinutes } from "@shared/playerTimeZone";

export type { HomeOutdoorLightingMode } from "@shared/housing";

export const HOME_OUTDOOR_NIGHT_DARKNESS = 78;
export const HOME_OUTDOOR_DAWN_START_MINUTE = 5 * 60 + 30;
export const HOME_OUTDOOR_DAY_START_MINUTE = 7 * 60 + 30;
export const HOME_OUTDOOR_DUSK_START_MINUTE = 18 * 60;
export const HOME_OUTDOOR_NIGHT_START_MINUTE = 20 * 60;
/** Park and World timelines are independent of the Pet Home's gradual
 * background-darkness calculation. Only the appearance of these scene effects
 * changes; the existing nighttime shading stays smooth.
 */
export const PARK_LAMPS_OFF_MINUTE = 6 * 60;
export const PARK_NIGHT_INTERIOR_START_MINUTE = 19 * 60;
export const PARK_DAY_INTERIOR_START_MINUTE = 6 * 60;

/** Night art: 19:00 through 05:59:59; day art returns at 06:00 sharp. */
export function isNightInteriorArtworkActive(mode: HomeOutdoorLightingMode, date: Date, timeZone?: string | null): boolean {
  if (mode === "day") return false;
  if (mode === "night") return true;
  const minute = localClockMinutes(date, timeZone);
  return minute >= PARK_NIGHT_INTERIOR_START_MINUTE || minute < PARK_DAY_INTERIOR_START_MINUTE;
}

/** Outdoor lamps activate at 18:00 and fade with the approaching dawn, fully
 * extinguishing at 06:00. Manual day/night previews override the clock.
 */
export function getParkLampStrength(mode: HomeOutdoorLightingMode, date: Date, timeZone?: string | null): number {
  if (mode === "day") return 0;
  if (mode === "night") return 1;
  const minute = localClockMinutes(date, timeZone);
  if (minute >= PARK_LAMPS_OFF_MINUTE && minute < HOME_OUTDOOR_DUSK_START_MINUTE) return 0;
  const strength = getAutomaticHomeNightStrength(date, timeZone);
  if (minute >= HOME_OUTDOOR_DAWN_START_MINUTE && minute < PARK_LAMPS_OFF_MINUTE) {
    return strength * (PARK_LAMPS_OFF_MINUTE - minute) /
      (PARK_LAMPS_OFF_MINUTE - HOME_OUTDOOR_DAWN_START_MINUTE);
  }
  return strength;
}
/** Fireflies begin at 19:00 alongside the nighttime interior artwork. */
export const PARK_FIREFLY_START_MINUTE = 19 * 60 + 30;
export const PARK_FIREFLY_FADE_IN_MINUTES = 45;
export function getParkFireflyStrength(mode: HomeOutdoorLightingMode, date: Date, timeZone?: string | null): number {
  if (mode === "day") return 0;
  if (mode === "night") return 1;
  const minute = localClockMinutes(date, timeZone);
  if (minute >= PARK_FIREFLY_START_MINUTE)
    return Math.min(1, (minute - PARK_FIREFLY_START_MINUTE) / PARK_FIREFLY_FADE_IN_MINUTES);
  if (minute < HOME_OUTDOOR_DAWN_START_MINUTE) return 1;
  if (minute < PARK_LAMPS_OFF_MINUTE)
    return 1 - (minute - HOME_OUTDOOR_DAWN_START_MINUTE) /
      (PARK_LAMPS_OFF_MINUTE - HOME_OUTDOOR_DAWN_START_MINUTE);
  return 0;
}
// Automatic samples still update every 30 seconds, but the rendered fade is
// intentionally short. Keeping a full-screen Home layer in a continuous
// 30-second CSS transition was unnecessarily expensive on iOS WebKit.
export const HOME_OUTDOOR_AUTO_TRANSITION_MS = 1_200;
export const HOME_OUTDOOR_OVERRIDE_TRANSITION_MS = 280;
// Short transition used when a mobile/browser page wakes from the background.
// It avoids a stale 30-second catch-up fade while still preventing a hard flash.
export const HOME_OUTDOOR_RESUME_TRANSITION_MS = 420;


export function cycleHomeOutdoorLightingMode(mode: HomeOutdoorLightingMode): HomeOutdoorLightingMode {
  if (mode === "auto") return "day";
  if (mode === "day") return "night";
  return "auto";
}

export function getAutomaticHomeNightStrength(date: Date, timeZone?: string | null): number {
  const minutes = localClockMinutes(date, timeZone);

  if (minutes >= HOME_OUTDOOR_DAY_START_MINUTE && minutes < HOME_OUTDOOR_DUSK_START_MINUTE) {
    return 0;
  }
  if (minutes >= HOME_OUTDOOR_NIGHT_START_MINUTE || minutes < HOME_OUTDOOR_DAWN_START_MINUTE) {
    return 1;
  }
  if (minutes >= HOME_OUTDOOR_DAWN_START_MINUTE && minutes < HOME_OUTDOOR_DAY_START_MINUTE) {
    const progress = (minutes - HOME_OUTDOOR_DAWN_START_MINUTE)
      / (HOME_OUTDOOR_DAY_START_MINUTE - HOME_OUTDOOR_DAWN_START_MINUTE);
    return Math.max(0, Math.min(1, 1 - progress));
  }

  const progress = (minutes - HOME_OUTDOOR_DUSK_START_MINUTE)
    / (HOME_OUTDOOR_NIGHT_START_MINUTE - HOME_OUTDOOR_DUSK_START_MINUTE);
  return Math.max(0, Math.min(1, progress));
}

export function getHomeOutdoorNightStrength(mode: HomeOutdoorLightingMode, date: Date, timeZone?: string | null): number {
  if (mode === "day") return 0;
  if (mode === "night") return 1;
  return getAutomaticHomeNightStrength(date, timeZone);
}

export function getHomeOutdoorDarkness(mode: HomeOutdoorLightingMode, date: Date, timeZone?: string | null): number {
  // Keep the fractional value so the rendered darkness can interpolate
  // continuously between the 30-second automatic lighting updates.
  return getHomeOutdoorNightStrength(mode, date, timeZone) * HOME_OUTDOOR_NIGHT_DARKNESS;
}
