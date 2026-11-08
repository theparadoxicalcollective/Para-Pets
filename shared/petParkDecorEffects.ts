import { isParkEffect, isValidParkLightColor, type ParkEffectType } from "./petParkEffects";

/** Effects are authored relative to each decoration's own image box.
 * Each duplicate retains independent placement, size, flip and depth.
 * Appearance edits and local effect anchors are shared by a group ID.
 */
export type ParkDecorEffect = {
  id: string;
  type: ParkEffectType;
  x: number;
  y: number;
  /** Percentage of the placed decoration's square artwork size. */
  size: number;
  /** Optional orb color for Lamp Light; required for Colored Light. */
  color?: string;
};

export const PARK_DECOR_EFFECT_MAX_COUNT = 8;
export const PARK_DECOR_EFFECT_MIN_SIZE = 8;
export const PARK_DECOR_EFFECT_MAX_SIZE = 120;

export function isValidParkDecorEffects(value: unknown): value is ParkDecorEffect[] {
  if (!Array.isArray(value) || value.length > PARK_DECOR_EFFECT_MAX_COUNT) return false;
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,90}$/.test(item.id) || ids.has(item.id) ||
      !isParkEffect(item.type) || !validNormalized(item.x) || !validNormalized(item.y) ||
      typeof item.size !== "number" || !Number.isFinite(item.size) ||
      item.size < PARK_DECOR_EFFECT_MIN_SIZE || item.size > PARK_DECOR_EFFECT_MAX_SIZE ||
      (item.type === "colored_light"
        ? !isValidParkLightColor(item.color)
        : item.type === "lamp_light"
          ? item.color !== undefined && !isValidParkLightColor(item.color)
          : item.color !== undefined)) return false;
    ids.add(item.id);
  }
  return true;
}

function validNormalized(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parkDecorEffectWorldPosition(
  item: { xPct: number; yPct: number; size: number; flipped: boolean },
  effect: ParkDecorEffect,
  scene: { width: number; height: number; scale: number },
): { x: number; y: number; size: number } {
  const artWidth = item.size * scene.scale;
  const x = (item.xPct * scene.width + (item.flipped ? 0.5 - effect.x : effect.x - 0.5) * artWidth) / scene.width;
  const y = (item.yPct * scene.height + (effect.y - 0.5) * artWidth) / scene.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    size: effect.size / 100 * artWidth / scene.height * 100,
  };
}
