import placeholderEnemyUrl from "@assets/generated_images/enemy_bayou_wraith.png";

/** The Demented Vulture art is not present yet. Replace only this import when its transparent PNG is added. */
export const ELYSIAN_CLEARING_COMBAT_CONFIG = {
  enemyName: "Demented Vulture",
  enemyImageUrl: placeholderEnemyUrl,
  maxEnemies: 3,
  homes: [{ x: 0.30, y: 0.25 }, { x: 0.69, y: 0.38 }, { x: 0.35, y: 0.57 }],
  initialSpawnDelayMs: [500, 1350, 2250],
  roamRadius: 0.075,
  roamSpeed: 0.035,
  pursuitSpeed: 0.072,
  aggroRadius: 0.20,
  disengageRadius: 0.30,
  attackRange: 0.075,
  attackWindupMs: 650,
  attackCooldownMs: 1450,
  petInvulnerabilityMs: 700,
  respawnProtectionMs: 1600,
  respawnDelayMs: { min: 8000, max: 14000 },
  roamPauseMs: { min: 900, max: 2400 },
  petAttackRange: 0.14,
  petAttackArcDot: 0.15,
  petAttackCooldownMs: 550,
  spriteSize: 86,
} as const;
