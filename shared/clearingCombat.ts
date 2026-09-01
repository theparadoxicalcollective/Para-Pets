export type ClearingAttackStyle = "sword_slash" | "staff_orb" | "default_melee";
export type EnemyTier = "normal" | "tough" | "elite";
export type FacingDirection = "left" | "right";
export type ClearingSpecialKind = "damage" | "heal";

export function resolveClearingSpecialKind(pet?: { specialSkill?: string | null; specialSkillType?: string | null; skillType?: string | null }): ClearingSpecialKind | null {
  if (!pet || !(pet.specialSkill || pet.specialSkillType || pet.skillType)) return null;
  const configuredType = pet.skillType?.trim().toLocaleLowerCase();
  if (configuredType === "heal" || configuredType === "revive") return "heal";
  const legacyName = `${pet.specialSkillType ?? ""} ${pet.specialSkill ?? ""}`.toLocaleLowerCase();
  return legacyName.includes("heal") || legacyName.includes("revive") ? "heal" : "damage";
}

export function clearingSpecialDamage(baseDamage: number) { return Math.round(baseDamage * 1.75); }
export function clearingSpecialHeal(maxHealth: number) { return Math.max(1, Math.round(maxHealth * .3)); }

export function resolveClearingAttackStyle(item?: { attackStyle?: string | null; name?: string | null }): ClearingAttackStyle {
  if (item?.attackStyle === "sword_slash" || item?.attackStyle === "staff_orb" || item?.attackStyle === "default_melee") return item.attackStyle;
  const name = item?.name?.trim().toLocaleLowerCase() ?? "";
  if (name.includes("sword")) return "sword_slash";
  if (name.includes("staff")) return "staff_orb";
  return "default_melee";
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


/** DEF has diminishing returns, capped at 60%; damage always remains positive. */
export function clearingIncomingDamage(rawDamage: number, defense: number): number {
  const safeDamage = Number.isFinite(rawDamage) ? Math.max(1, rawDamage) : 1;
  const safeDefense = Number.isFinite(defense) ? Math.max(0, defense) : 0;
  const reduction = Math.min(0.6, safeDefense / (safeDefense + 400));
  return Math.max(1, Math.round(safeDamage * (1 - reduction)));
}

/** Preserve the HP fraction on a gear swap, including defeat. Never heal by swapping. */
export function clearingHealthAfterGearChange(health: number, oldMax: number, newMax: number): number {
  if (health <= 0) return 0;
  const fraction = Math.min(1, Math.max(0, health / Math.max(1, oldMax)));
  return Math.min(newMax, Math.max(0, fraction * newMax));
}
