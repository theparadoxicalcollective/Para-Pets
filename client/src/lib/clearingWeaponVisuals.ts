import type { ClearingStarRarity } from "@shared/clearingEquipment";

export type ClearingAttackPhase = "idle" | "windup" | "impact" | "recovery";

export const CLEARING_SWORD_TIMING = {
  windupMs: 90,
  impactMs: 70,
  recoveryMs: 140,
  totalMs: 300,
} as const;

/** The production sword art points blade-up, so -135deg places its blade down/forward. */
export function swordTransform(facing: "left" | "right", phase: Exclude<ClearingAttackPhase, "idle">): string {
  const rotation = phase === "windup" ? -65 : phase === "impact" ? -135 : -155;
  return `translate(-50%, -88%) scaleX(${facing === "left" ? -1 : 1}) rotate(${rotation}deg)`;
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
