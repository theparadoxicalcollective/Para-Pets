import { getHouseInteriorLightCutoutStrength } from "@shared/housing";

/**
 * Maximum local night-darkness reduction of a Pet Park / World Editor lamp.
 * Stronger than before so nearby trees, paths and buildings stay readable,
 * without tinting the scenery or changing light artwork / saved sizes.
 *
 * The neutral SVG mask uses ordinary black alpha gradients instead of
 * mix-blend-mode inside a luminance mask: the latter can fail in WebKit.
 * Overlapping real lamps naturally contribute more light; darkness elsewhere
 * is unchanged, and the mask cannot become brighter than the original art.
 */
export const PARK_SCENE_LAMP_MAX_REVEAL = 0.66;
/** An individual firefly reveals only a tiny patch of the original scene. */
export const PARK_SCENE_FIREFLY_MAX_REVEAL = 0.36;
export function parkSceneFireflyMaskChannel(strength: number, falloff: number): number {
  const active = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const fade = Number.isFinite(falloff) ? Math.max(0, Math.min(1, falloff)) : 0;
  return Math.round(255 * (1 - PARK_SCENE_FIREFLY_MAX_REVEAL * active * fade));
}
export function parkSceneLampMaskChannel(nightStrength: number, falloff: number): number {
  const night = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  const fade = Number.isFinite(falloff) ? Math.max(0, Math.min(1, falloff)) : 0;
  const peak = Math.min(PARK_SCENE_LAMP_MAX_REVEAL,
    getHouseInteriorLightCutoutStrength("lamp_light"));
  return Math.round(255 * (1 - peak * night * fade));
}

/** Outdoor night for Pet Park and authored worlds, without changing Pet Home lighting. */
export const PARK_SCENE_NIGHT_DARKNESS = 84;

export function parkSceneDarkness(nightStrength: number): number {
  const strength = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  return strength * PARK_SCENE_NIGHT_DARKNESS;
}

/** Outdoor lamps turn on with nightfall; sunlit windows follow daylight.
 * Fire and non-light visual effects keep their existing non-clock behavior.
 */
export function parkOutdoorEffectOpacity(type: string, nightStrength: number, fireflyStrength = 0, lampStrength = nightStrength): number {
  const night = Number.isFinite(nightStrength) ? Math.max(0, Math.min(1, nightStrength)) : 0;
  if (type === "fireflies") return Number.isFinite(fireflyStrength) ? Math.max(0, Math.min(1, fireflyStrength)) : 0;
  if (type === "lamp_light" || type === "colored_light" || type === "candle_light")
    return Number.isFinite(lampStrength) ? Math.max(0, Math.min(1, lampStrength)) : 0;
  if (type === "warm_glow") return 1 - night;
  return 1;
}
