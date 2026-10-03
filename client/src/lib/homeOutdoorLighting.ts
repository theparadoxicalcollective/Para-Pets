export type HomeOutdoorLightingMode = "auto" | "day" | "night";

export const HOME_OUTDOOR_LIGHTING_STORAGE_KEY = "para-home-outdoor-lighting-mode-v1";
export const HOME_OUTDOOR_NIGHT_DARKNESS = 68;
export const HOME_OUTDOOR_DAWN_START_MINUTE = 5 * 60 + 30;
export const HOME_OUTDOOR_DAY_START_MINUTE = 7 * 60 + 30;
export const HOME_OUTDOOR_DUSK_START_MINUTE = 18 * 60;
export const HOME_OUTDOOR_NIGHT_START_MINUTE = 20 * 60;

export function isHomeOutdoorLightingMode(value: unknown): value is HomeOutdoorLightingMode {
  return value === "auto" || value === "day" || value === "night";
}

export function cycleHomeOutdoorLightingMode(mode: HomeOutdoorLightingMode): HomeOutdoorLightingMode {
  if (mode === "auto") return "day";
  if (mode === "day") return "night";
  return "auto";
}

export function getAutomaticHomeNightStrength(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

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

export function getHomeOutdoorNightStrength(mode: HomeOutdoorLightingMode, date: Date): number {
  if (mode === "day") return 0;
  if (mode === "night") return 1;
  return getAutomaticHomeNightStrength(date);
}

export function getHomeOutdoorDarkness(mode: HomeOutdoorLightingMode, date: Date): number {
  return Math.round(getHomeOutdoorNightStrength(mode, date) * HOME_OUTDOOR_NIGHT_DARKNESS);
}
