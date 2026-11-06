import { HOUSE_OUTDOOR_EFFECT_TYPES, type HouseOutdoorEffectType } from "./housing";

// Keep the original water effects for existing parks while sharing the same seven
// outdoor effect types used by Home Bundle editing.
export const PARK_WATER_EFFECT_TYPES = ["waterfall_mist", "water_ripple", "water_shimmer", "water_flow", "water_drop"] as const;
export type ParkWaterEffect = (typeof PARK_WATER_EFFECT_TYPES)[number];
export type ParkEffectType = ParkWaterEffect | HouseOutdoorEffectType;

export function isParkWaterEffect(value: unknown): value is ParkWaterEffect {
  return typeof value === "string" && (PARK_WATER_EFFECT_TYPES as readonly string[]).includes(value);
}

export function isParkOutdoorEffect(value: unknown): value is HouseOutdoorEffectType {
  return typeof value === "string" && (HOUSE_OUTDOOR_EFFECT_TYPES as readonly string[]).includes(value);
}

export function isParkEffect(value: unknown): value is ParkEffectType {
  return isParkWaterEffect(value) || isParkOutdoorEffect(value);
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
  { type: "water_flow", label: "Vertical Water Flow", description: "Falling streams for waterfalls and flowing water", defaultSize: 155, interiorSize: 24 },
  { type: "water_drop", label: "Water Drop", description: "A single faint drop falling slowly on a loop", defaultSize: 80, interiorSize: 12 },
];
