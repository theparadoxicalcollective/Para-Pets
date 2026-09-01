export const CLEARING_ENEMY_TYPES = ["regular", "mini_boss", "boss"] as const;
export type ClearingEnemyType = typeof CLEARING_ENEMY_TYPES[number];
export const CLEARING_ENEMY_TYPE_LABELS: Record<ClearingEnemyType, string> = {
  regular: "Regular", mini_boss: "Mini boss", boss: "Boss",
};

/** Preserve existing assignments and clients that only know the boss flag. */
export function resolveClearingEnemyType(enemy: { is_boss?: boolean; enemy_type?: string }): ClearingEnemyType {
  if (enemy.is_boss) return "boss";
  return enemy.enemy_type === "mini_boss" ? "mini_boss" : "regular";
}

export function parseClearingEnemyType(body: { enemyType?: unknown; isBoss?: unknown }): ClearingEnemyType {
  if (body.enemyType !== undefined) {
    if (!(CLEARING_ENEMY_TYPES as readonly unknown[]).includes(body.enemyType)) throw new Error("Invalid enemy type");
    const type = body.enemyType as ClearingEnemyType;
    if (body.isBoss !== undefined && body.isBoss !== (type === "boss")) throw new Error("Conflicting enemy type and boss status");
    return type;
  }
  if (typeof body.isBoss !== "boolean") throw new Error("Choose an enemy type");
  return body.isBoss ? "boss" : "regular";
}
