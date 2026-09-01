import type { ClearingPoint } from "@shared/clearingCombatGeometry";

export const CLEARING_BOSS_ATTACK = {
  firstDelayMs: 2200,
  cooldownMs: 4000,
  warningMs: 1300,
  recoveryMs: 1800,
  radiusPixels: 64,
} as const;
export interface ClearingBossAttack {
  phase: "waiting" | "telegraph" | "recovery";
  remainingMs: number;
  center: ClearingPoint;
}

/** Use active simulation time: menus, hidden tabs and long frames cannot consume a warning. */
export function stepClearingBossAttack(current: ClearingBossAttack | undefined, pet: ClearingPoint, deltaMs: number) {
  const attack: ClearingBossAttack = current
    ? { ...current, remainingMs: current.remainingMs - Math.max(0, Math.min(50, deltaMs)) }
    : { phase: "waiting", remainingMs: CLEARING_BOSS_ATTACK.firstDelayMs, center: { ...pet } };
  let impact = false;
  if (attack.remainingMs <= 0) {
    if (attack.phase === "waiting") {
      attack.phase = "telegraph";
      attack.remainingMs = CLEARING_BOSS_ATTACK.warningMs;
      attack.center = { ...pet }; // Lock the marked ground; it never follows the player.
    } else if (attack.phase === "telegraph") {
      impact = true;
      attack.phase = "recovery";
      attack.remainingMs = CLEARING_BOSS_ATTACK.recoveryMs;
    } else {
      attack.phase = "waiting";
      attack.remainingMs = CLEARING_BOSS_ATTACK.cooldownMs;
    }
  }
  return { attack, impact };
}

/** The pet's ground point and the drawn circle use the same world-pixel radius. */
export function clearingBossAttackHits(center: ClearingPoint, pet: ClearingPoint, world: { width: number; height: number }) {
  return Math.hypot((pet.x - center.x) * world.width, (pet.y - center.y) * world.height) <= CLEARING_BOSS_ATTACK.radiusPixels;
}
