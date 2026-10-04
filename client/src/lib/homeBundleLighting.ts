import type { HouseInteriorEffect } from "@shared/housing";

export const HOME_BUNDLE_LAMP_ILLUMINATION_SCALE = 1.5;
export const HOME_BUNDLE_LAMP_ILLUMINATION_MAX_SIZE = 56;

/**
 * Home Bundle Lamp Light effects are authored directly on a room/yard.
 * Their visible glow stays exactly at the Admin-authored size, while the
 * darkness-reveal footprint is widened at runtime so it behaves more like
 * a smaller campfire. Attached Decor/Object lamps use their own helper and
 * are intentionally not changed here.
 */
export function broadenHomeBundleLampIllumination(
  effects: readonly HouseInteriorEffect[],
): HouseInteriorEffect[] {
  return effects.map(effect => effect.type === "lamp_light" ? {
    ...effect,
    size: Math.min(
      HOME_BUNDLE_LAMP_ILLUMINATION_MAX_SIZE,
      Math.max(effect.size, effect.size * HOME_BUNDLE_LAMP_ILLUMINATION_SCALE),
    ),
  } : effect);
}
