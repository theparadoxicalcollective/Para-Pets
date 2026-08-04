import type { ClearingStarRarity } from "@shared/clearingEquipment";
import type { ClearingAttackStyle } from "@shared/clearingCombat";

export type ClearingAttackPhase = "idle" | "windup" | "impact" | "recovery";

export const CLEARING_SWORD_TIMING = {
  windupMs: 90,
  impactMs: 70,
  recoveryMs: 140,
  totalMs: 300,
} as const;

export const CLEARING_TRAINING_SWORD_KEY = "clearing-training-sword";

/** Inventory-only metadata; combat animation transforms remain independent. */
export function inventoryWeaponRotation(stableKey?: string | null): number {
  return stableKey === CLEARING_TRAINING_SWORD_KEY ? 45 : 0;
}

/** Local hand motion only. Target-facing VFX remain on their own rotated layer. */
export function weaponAttackTransform(phase: ClearingAttackPhase, style: ClearingAttackStyle = "sword_slash"): string {
  const staff = style === "staff_orb";
  const rotation = phase === "windup"
    ? (staff ? -16 : -30)
    : phase === "impact"
      ? (staff ? 20 : 34)
      : phase === "recovery"
        ? (staff ? 7 : 10)
        : 0;
  const reach = phase === "windup"
    ? (staff ? -1 : -2)
    : phase === "impact"
      ? (staff ? 4 : 5)
      : phase === "recovery"
        ? 1
        : 0;
  return `translateX(${reach}px) rotate(${rotation}deg)`;
}

export function weaponRarityFilter(stars: number): string {
  const glow: Record<ClearingStarRarity, string> = {
    1: "drop-shadow(0 0 1px rgba(255,255,255,.18))",
    2: "drop-shadow(0 0 3px rgba(110,220,255,.45))",
    3: "drop-shadow(0 0 5px rgba(130,110,255,.62))",
    4: "drop-shadow(0 0 7px rgba(220,90,255,.72))",
    5: "drop-shadow(0 0 8px rgba(255,205,70,.82)) drop-shadow(0 0 3px rgba(255,255,255,.55))",
  };
  return glow[Math.max(1, Math.min(5, Math.round(stars))) as ClearingStarRarity];
}
