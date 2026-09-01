import { clearingIncomingDamage } from "./clearingCombat";

export const CLEARING_BLESSING_DEFEATS = 5;
export const CLEARING_BLESSINGS = {
  thornfang: { name: "Thornfang", description: "Basic attacks deal 20% more damage." },
  barkskin: { name: "Barkskin", description: "Take 15% less damage after defense." },
  wisplight: { name: "Wisplight", description: "Successful basic attacks charge 35 mana instead of 25." },
} as const;
export type ClearingBlessingId = keyof typeof CLEARING_BLESSINGS;
export interface ClearingHuntBlessingState { huntId: string; selected: ClearingBlessingId | null }
export function isClearingBlessing(value: unknown): value is ClearingBlessingId {
  return typeof value === "string" && Object.hasOwn(CLEARING_BLESSINGS, value);
}
export function clearingBlessedBasicDamage(attack: number, blessing: ClearingBlessingId | null) {
  const base = Math.max(20, Math.min(5000, Math.round(attack)));
  return Math.min(5000, Math.round(base * (blessing === "thornfang" ? 1.2 : 1)));
}
export function clearingBlessedIncomingDamage(attack: number, defense: number, blessing: ClearingBlessingId | null) {
  return Math.max(1, Math.round(clearingIncomingDamage(attack, defense) * (blessing === "barkskin" ? .85 : 1)));
}
export function clearingBlessedMana(blessing: ClearingBlessingId | null) {
  return blessing === "wisplight" ? 35 : 25;
}
