import type { ClearingStarRarity } from "@shared/clearingEquipment";

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

/** Attack motion is local to the already direction-oriented weapon wrapper. */
export function weaponAttackTransform(phase: ClearingAttackPhase): string {
  const rotation = phase === "windup" ? -15 : phase === "impact" ? 22 : phase === "recovery" ? 7 : 0;
  const reach = phase === "impact" ? 4 : 0;
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
