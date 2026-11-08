import { getHouseInteriorLightCutoutStrength } from "@shared/housing";

/**
 * The scene-only lamp mask uses opaque *neutral* grays. Gray 255 means no
 * illumination; lower values reveal more of the original night-darkened art.
 * Unlike overlapping translucent black circles, opaque grays can be combined
 * with SVG darken blending without adding their brightness together.
 */
export const PARK_SCENE_LAMP_MAX_REVEAL = 0.48;
export function parkSceneLampMaskChannel(nightStrength: number, falloff: number): number {
  const night = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  const fade = Number.isFinite(falloff) ? Math.max(0, Math.min(1, falloff)) : 0;
  const peak = Math.min(PARK_SCENE_LAMP_MAX_REVEAL,
    getHouseInteriorLightCutoutStrength("lamp_light"));
  return Math.round(255 * (1 - peak * night * fade));
}

/** Outdoor night for Pet Park and authored worlds, without changing Pet Home lighting. */
export const PARK_SCENE_NIGHT_DARKNESS = 88;

export function parkSceneDarkness(nightStrength: number): number {
  const strength = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  return strength * PARK_SCENE_NIGHT_DARKNESS;
}

/** Outdoor lamps turn on with nightfall; sunlit windows follow daylight.
 * Fire and non-light visual effects keep their existing non-clock behavior.
 */
export function parkOutdoorEffectOpacity(type: string, nightStrength: number): number {
  const night = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  if (type === "lamp_light" || type === "candle_light") return night;
  if (type === "warm_glow") return 1 - night;
  return 1;
}
