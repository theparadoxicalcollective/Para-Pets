import { basePetPartType, EAR_PART_TYPES, HAIR_PART_TYPES } from "./petPartConfig";

export const PET_ANIMATION_PROFILES = ["standard_ground", "standard_flying", "bat", "marionette"] as const;
export type PetAnimationProfile = typeof PET_ANIMATION_PROFILES[number];

export const DEFAULT_PET_ANIMATION = {
  body: { durationSec: 4.8, scaleX: 1.006, scaleY: 1.012 },
  ear: { durationSec: 5, secondaryDurationSec: 5.3, degrees: 0.8, phaseSec: 0.28 },
  batEar: { durationSec: 4.8, degrees: 0.7, phaseSec: 0.22 },
  hair: { durationSec: 4.6, degrees: 0.45 },
  head: { durationSec: 3 },
  wing: { durationSec: 4, degrees: 5 },
  tail: { durationSec: 4.5, degrees: 1.2 },
} as const;

export function normalizeAnimationProfile(value: unknown, canFly = false): PetAnimationProfile {
  if (value === "bat" || value === "marionette" || value === "standard_ground" || value === "standard_flying") return value;
  return canFly ? "standard_flying" : "standard_ground";
}

export function isEarPart(partType: string) { return EAR_PART_TYPES.has(basePetPartType(partType)); }
export function isHairPart(partType: string) { return HAIR_PART_TYPES.has(basePetPartType(partType)); }

export interface HeadBobGeometry {
  bodyHeight?: number;
  alphaTop?: number;
  alphaHeight?: number;
  pivotY?: number;
  canFly?: boolean;
  canvasSize?: number;
}

/**
 * Keep the head wrapper on the body's actual inhale rise. Both the pet and
 * costume renderers call this, so head-mounted artwork cannot drift away from
 * the head. The cap intentionally keeps idle motion subtle, while avoiding a
 * minimum that could exceed the rise of a small visible body and open a seam.
 */
export function getHeadBobCssPercent({
  bodyHeight,
  alphaTop = 0,
  alphaHeight = 1,
  pivotY = 50,
  canFly = false,
  canvasSize = 1000,
}: HeadBobGeometry): string {
  if (!bodyHeight || bodyHeight <= 0 || canvasSize <= 0) return "-0.35%";
  const visibleBodyHeight = bodyHeight * Math.max(0, Math.min(1, alphaHeight));
  const scaleRisePercent = Math.max(0, (DEFAULT_PET_ANIMATION.body.scaleY - 1) * 100);
  const topRiseFraction = canFly
    ? Math.max(0, Math.min(1, alphaTop + alphaHeight * Math.max(0, Math.min(100, pivotY)) / 100))
    : 1;
  const actualTopRise = (visibleBodyHeight / canvasSize) * scaleRisePercent * topRiseFraction;
  return `-${Math.min(0.75, actualTopRise).toFixed(2)}%`;
}

export function earMotion(partType: string, sec: number, profile: PetAnimationProfile) {
  const base = basePetPartType(partType);
  const right = base.startsWith("right_");
  const secondary = base.endsWith("_2");
  const config = profile === "bat" ? DEFAULT_PET_ANIMATION.batEar : DEFAULT_PET_ANIMATION.ear;
  const duration = secondary && profile !== "bat" ? DEFAULT_PET_ANIMATION.ear.secondaryDurationSec : config.durationSec;
  const phase = right ? config.phaseSec : 0;
  const direction = right ? 1 : -1;
  return direction * Math.sin(((sec + phase) / duration) * Math.PI * 2) * config.degrees;
}

/** Maps a saved visible-art pivot into the full padded image coordinate space. */
export function alphaAdjustedPivot(
  pivotX: number | null | undefined,
  pivotY: number | null | undefined,
  bounds: { left: number; top: number; width: number; height: number },
  fallback: { x: number; y: number },
) {
  const px = pivotX == null ? fallback.x : pivotX / 100;
  const py = pivotY == null ? fallback.y : pivotY / 100;
  return {
    x: Math.max(0, Math.min(1, bounds.left + bounds.width * px)),
    y: Math.max(0, Math.min(1, bounds.top + bounds.height * py)),
  };
}
