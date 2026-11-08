import { HOUSE_OUTDOOR_EFFECT_TYPES, type HouseOutdoorEffectType } from "./housing";

// Keep the original water effects for existing parks while sharing the same seven
// outdoor effect types used by Home Bundle editing.
export const PARK_WATER_EFFECT_TYPES = ["waterfall_mist", "water_ripple", "water_shimmer", "water_flow", "water_drop"] as const;
export type ParkWaterEffect = (typeof PARK_WATER_EFFECT_TYPES)[number];
export type ParkEffectType = ParkWaterEffect | HouseOutdoorEffectType | "colored_light" | "fireflies";

/** Only Pet Park and the new World Editor support configurable colored orbs. */
export const DEFAULT_PARK_LIGHT_COLOR = "#f4bd65";
export const PARK_FIREFLIES_OPTION = {
  type: "fireflies" as const,
  label: "Fireflies",
  description: "Tiny fluttering lights with soft halos; appear after 7 PM",
  defaultSize: 190,
};
export const PARK_COLORED_LIGHT_OPTION = {
  type: "colored_light" as const,
  label: "Colored Light",
  description: "Choose the color of the small glowing orb; scenery illumination stays neutral",
  defaultSize: 16,
};
export function isValidParkLightColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
export function parkLightColor(color: unknown): string {
  return isValidParkLightColor(color) ? color : DEFAULT_PARK_LIGHT_COLOR;
}

export function isParkWaterEffect(value: unknown): value is ParkWaterEffect {
  return typeof value === "string" && (PARK_WATER_EFFECT_TYPES as readonly string[]).includes(value);
}

export function isParkOutdoorEffect(value: unknown): value is HouseOutdoorEffectType {
  return typeof value === "string" && (HOUSE_OUTDOOR_EFFECT_TYPES as readonly string[]).includes(value);
}

export function isParkEffect(value: unknown): value is ParkEffectType {
  return value === "colored_light" || value === "fireflies" || isParkWaterEffect(value) || isParkOutdoorEffect(value);
}

/** One source of truth for Pet Park water effects in BOTH scene and building editors. */
export const PARK_WATER_EFFECT_OPTIONS: Array<{
  type: ParkWaterEffect; label: string; description: string;
  defaultSize: number; interiorSize: number;
}> = [
  { type: "waterfall_mist", label: "Waterfall Mist", description: "Soft mist near a cascade", defaultSize: 130, interiorSize: 22 },
  { type: "water_ripple", label: "Water Ripples", description: "Gentle expanding ripples", defaultSize: 110, interiorSize: 16 },
  { type: "water_shimmer", label: "Water Shimmer", description: "Soft, shifting surface reflections for ponds and pools", defaultSize: 140, interiorSize: 20 },
  { type: "water_flow", label: "Vertical Water Flow", description: "Downward turquoise and white streaks for falling water", defaultSize: 170, interiorSize: 24 },
  { type: "water_drop", label: "Water Drop", description: "A single faint drop falling slowly on a loop", defaultSize: 80, interiorSize: 12 },
];
