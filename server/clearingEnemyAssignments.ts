import { sql } from "drizzle-orm";
import { assertWorld, getClearingConfig } from "./clearingConfig";
import type { ClearingEnemyType } from "@shared/clearingEnemyTypes";

// Assignment-scoped metadata uses the existing settings store. No schema migration
// or rewriting of the reusable enemy artwork catalog is needed for this admin label.
const typeKey = (assignmentId: string) => `clearing-enemy-type:${assignmentId}`;
async function saveType(tx: any, assignmentId: string, type: ClearingEnemyType) {
  if (type === "mini_boss") {
    await tx.execute(sql`INSERT INTO game_settings(key,value) VALUES(${typeKey(assignmentId)},'mini_boss') ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
  } else {
    await tx.execute(sql`DELETE FROM game_settings WHERE key=${typeKey(assignmentId)}`);
  }
}
async function requireBossDrop(tx: any, worldId: string, type: ClearingEnemyType) {
  if (type !== "boss") return;
  const config = await getClearingConfig(tx, worldId);
  if (!config.drops.some((drop: any) => drop.effective_rarity === "rare")) throw new Error("Configure a Rare drop before enabling a boss");
}

export async function addClearingEnemy(db: any, worldId: string, enemyId: string, type: ClearingEnemyType) {
  await db.transaction(async (tx: any) => {
    await assertWorld(tx, worldId);
    const enemy = await tx.execute(sql`SELECT id FROM enemies WHERE id=${enemyId}`);
    if (!enemy.rows.length) throw new Error("Unknown enemy");
    await requireBossDrop(tx, worldId, type);
    const inserted = await tx.execute(sql`INSERT INTO clearing_world_enemies(world_id,enemy_id,is_boss) VALUES(${worldId},${enemyId},${type === "boss"}) ON CONFLICT(world_id,enemy_id) DO NOTHING RETURNING id`);
    // Duplicate Add requests must not overwrite an existing assignment's type.
    if (inserted.rows.length) await saveType(tx, inserted.rows[0].id, type);
  });
}

export async function changeClearingEnemyType(db: any, assignmentId: string, type: ClearingEnemyType) {
  return db.transaction(async (tx: any) => {
    const found = await tx.execute(sql`SELECT world_id FROM clearing_world_enemies WHERE id=${assignmentId} FOR UPDATE`);
    if (!found.rows.length) throw new Error("Unknown assignment");
    const worldId = found.rows[0].world_id;
    await requireBossDrop(tx, worldId, type);
    await tx.execute(sql`UPDATE clearing_world_enemies SET is_boss=${type === "boss"} WHERE id=${assignmentId}`);
    await saveType(tx, assignmentId, type);
    return worldId as string;
  });
}

export async function removeClearingEnemy(db: any, assignmentId: string) {
  return db.transaction(async (tx: any) => {
    const removed = await tx.execute(sql`DELETE FROM clearing_world_enemies WHERE id=${assignmentId} RETURNING world_id`);
    if (!removed.rows.length) return null;
    await tx.execute(sql`DELETE FROM game_settings WHERE key=${typeKey(assignmentId)}`);
    return removed.rows[0].world_id as string;
  });
}
