import { HOUSE_OUTDOOR_EFFECT_TYPES, type HouseOutdoorEffectType } from "./housing";

// Keep the original water effects for existing parks while sharing the same seven
// outdoor effect types used by Home Bundle editing.
export const PARK_WATER_EFFECT_TYPES = ["waterfall_mist", "water_ripple", "water_shimmer"] as const;
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
