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
