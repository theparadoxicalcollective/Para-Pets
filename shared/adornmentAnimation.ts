export const ADORNMENT_ANIMATIONS = ["none", "breathe", "float", "wings", "sway", "rotate"] as const;
export type AdornmentAnimation = typeof ADORNMENT_ANIMATIONS[number];

export const ADORNMENT_ITEM_EFFECTS = ["still", "float", "spin", "sway", "pulse", "wings"] as const;
export const ADORNMENT_GENERAL_ITEM_EFFECTS = ["still", "float", "spin", "sway", "pulse"] as const;
export type AdornmentItemEffect = typeof ADORNMENT_ITEM_EFFECTS[number];

export const ADORNMENT_ITEM_EFFECT_LABELS: Record<AdornmentItemEffect, string> = {
  still: "Still",
  float: "Float — balloon-like loop",
  spin: "Spin — slow clockwise",
  sway: "Sway — gentle side to side",
  pulse: "Pulse — subtle magical breathing",
  wings: "Wings — mirrored open / close",
};

/** Uploaded artwork is served by our media endpoint, never an arbitrary URL. */
export const ADORNMENT_IMAGE_URL_PATTERN = /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADORNMENT_ANIMATION_LABELS: Record<AdornmentAnimation, string> = {
  none: "Still", breathe: "Breathe", float: "Subtle float",
  wings: "Wings (mirrored pair)", sway: "Sway", rotate: "Slow rotation",
};

export function normalizeAdornmentAnimation(value: unknown): AdornmentAnimation {
  return ADORNMENT_ANIMATIONS.includes(value as AdornmentAnimation) ? value as AdornmentAnimation : "none";
}

export function isAdornmentItemEffect(value: unknown): value is AdornmentItemEffect {
  return typeof value === "string" && ADORNMENT_ITEM_EFFECTS.includes(value as AdornmentItemEffect);
}

/** Item-level effect overrides legacy fitted motion while preserving its saved placement. */
export function adornmentItemEffectAnimation(effect: AdornmentItemEffect | null | undefined): AdornmentAnimation | null {
  if (!effect) return null;
  return {
    still: "none",
    float: "float",
    spin: "rotate",
    sway: "sway",
    pulse: "breathe",
    wings: "wings",
  }[effect];
}

/** CSS-only motion: no animation timers or per-frame React updates. */
export function adornmentMotion(animation: AdornmentAnimation, speed = 1, enabled = true) {
  if (!enabled || animation === "none") return undefined;
  const seconds = { breathe: 3.6, float: 4, wings: 1.8, sway: 4.5, rotate: 16 }[animation];
  const safeSpeed = Number.isFinite(speed) ? Math.max(0.25, Math.min(2, speed)) : 1;
  return `adornment-${animation} ${seconds / safeSpeed}s ${animation === "rotate" ? "linear" : "ease-in-out"} infinite`;
}

export const ADORNMENT_MOTION_CSS = `
@keyframes adornment-breathe { 0%,100% { transform:scale(1); } 50% { transform:scale(1.025,1.035); } }
@keyframes adornment-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3%); } }
@keyframes adornment-wings { 0%,100% { transform:rotate(-10deg) scaleX(.74); } 50% { transform:rotate(8deg) scaleX(1); } }
@keyframes adornment-sway { 0%,100% { transform:rotate(-4deg); } 50% { transform:rotate(4deg); } }
@keyframes adornment-rotate { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .adornment-motion { animation:none !important; } }
`;
