export type ClearingAttackStyle = "sword_slash" | "staff_orb" | "basic_melee";
export type EnemyTier = "normal" | "tough" | "elite";
export type FacingDirection = "left" | "right";

export function resolveClearingAttackStyle(item?: { attackStyle?: string | null; name?: string | null }): ClearingAttackStyle {
  if (item?.attackStyle === "sword_slash" || item?.attackStyle === "staff_orb" || item?.attackStyle === "basic_melee") return item.attackStyle;
  const name = item?.name?.trim().toLocaleLowerCase() ?? "";
  if (name.includes("sword") || name.includes("blade")) return "sword_slash";
  if (name.includes("staff") || name.includes("wand")) return "staff_orb";
  return "basic_melee";
}

export function nextEnemyFacing(last: FacingDirection, velocityX: number, deadZone = 3): FacingDirection {
  if (Math.abs(velocityX) < deadZone) return last;
  return velocityX < 0 ? "left" : "right";
}

export function enemyFlipScale(movementFacing: FacingDirection, naturalFacing: FacingDirection) {
  return movementFacing === naturalFacing ? 1 : -1;
}

export const CLEARING_TIER_RARITY_WEIGHTS = {
  normal: [76, 20, 4, 0, 0],
  tough: [35, 45, 18, 2, 0],
  elite: [0, 48, 42, 9, 1],
} as const;

export function rollTierRarity(tier: EnemyTier, random = Math.random): 1|2|3|4|5 {
  let roll = random() * 100;
  const weights = CLEARING_TIER_RARITY_WEIGHTS[tier];
  for (let i=0;i<weights.length;i++) { roll -= weights[i]; if (roll < 0) return (i+1) as 1|2|3|4|5; }
  return tier === "elite" ? 5 : tier === "tough" ? 4 : 3;
}
