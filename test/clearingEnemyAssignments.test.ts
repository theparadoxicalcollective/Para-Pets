import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { addClearingEnemy, changeClearingEnemyType, removeClearingEnemy } from "../server/clearingEnemyAssignments";
import { getClearingConfig } from "../server/clearingConfig";
import { parseClearingEnemyType, resolveClearingEnemyType } from "../shared/clearingEnemyTypes";

function fixture() {
  const dialect = new PgDialect();
  let rows = new Map<string, any>(), settings = new Map<string, string>(), next = 0;
  const db = {
    rare: false, failSettings: false,
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const before = structuredClone({ rows, settings });
      try { return await work(db); }
      catch (error) { rows = before.rows; settings = before.settings; throw error; }
    },
    async execute(query: any): Promise<{ rows: any[] }> {
      const { sql, params: p } = dialect.sqlToQuery(query);
      if (sql.startsWith("SELECT id,name FROM worlds") || sql.startsWith("SELECT id FROM worlds")) return { rows: [{ id: p[0], name: "Bayou" }] };
      if (sql.startsWith("SELECT id FROM enemies")) return { rows: p[0] === "unknown" ? [] : [{ id: p[0] }] };
      if (sql.includes("FROM clearing_world_drops d JOIN")) return { rows: db.rare ? [{ id: "drop", rarity: "rare", star_rarity: 1 }] : [] };
      if (sql.includes("FROM clearing_world_special_mobs")) return { rows: [] };
      if (sql.includes("FROM clearing_world_enemies a JOIN")) {
        assert.match(sql, /LEFT JOIN game_settings/);
        return { rows: [...rows.values()].filter(row => row.world_id === p[0]).map(row => ({ ...row, enemy_type: row.is_boss ? "boss" : settings.get(`clearing-enemy-type:${row.id}`) ?? "regular" })) };
      }
      if (sql.startsWith("INSERT INTO clearing_world_enemies")) {
        if ([...rows.values()].some(row => row.world_id === p[0] && row.enemy_id === p[1])) return { rows: [] };
        const id = `assignment-${++next}`;rows.set(id, { id, world_id: p[0], enemy_id: p[1], is_boss: p[2], name: String(p[1]) });return { rows: [{ id }] };
      }
      if (sql.startsWith("SELECT world_id FROM clearing_world_enemies")) {
        assert.match(sql, /FOR UPDATE/);const row = rows.get(String(p[0]));return { rows: row ? [row] : [] };
      }
      if (sql.startsWith("UPDATE clearing_world_enemies")) { rows.get(String(p[1])).is_boss = p[0];return { rows: [] }; }
      if (sql.startsWith("DELETE FROM clearing_world_enemies")) { const row = rows.get(String(p[0]));rows.delete(String(p[0]));return { rows: row ? [row] : [] }; }
      if (sql.includes("game_settings")) {
        if (db.failSettings) throw new Error("Settings unavailable");
        if (sql.startsWith("INSERT")) settings.set(String(p[0]), "mini_boss");else settings.delete(String(p[0]));return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    settings: () => new Map(settings),
  };
  return db;
}

test("enemy type requests validate all three choices and retain legacy boss clients", () => {
  for (const type of ["regular", "mini_boss", "boss"] as const) assert.equal(parseClearingEnemyType({ enemyType: type }), type);
  assert.equal(parseClearingEnemyType({ isBoss: true }), "boss");
  assert.equal(parseClearingEnemyType({ isBoss: false }), "regular");
  for (const body of [{}, { enemyType: "elite" }, { enemyType: null }, { enemyType: "mini_boss", isBoss: true }, { isBoss: "false" }]) assert.throws(() => parseClearingEnemyType(body));
  assert.equal(resolveClearingEnemyType({ is_boss: true }), "boss");
  assert.equal(resolveClearingEnemyType({ is_boss: false }), "regular");
});

test("Mini boss persists through config reload, is scoped to the assignment, and duplicate Adds do not change it", async () => {
  const db = fixture();
  await addClearingEnemy(db, "swamp", "snake", "mini_boss");
  await addClearingEnemy(db, "desert", "snake", "regular");
  await addClearingEnemy(db, "swamp", "snake", "regular");
  const swamp = await getClearingConfig(db, "swamp"), desert = await getClearingConfig(db, "desert");
  assert.equal(swamp.enemies.length, 1);
  assert.equal(swamp.enemies[0].enemy_type, "mini_boss");
  assert.equal(swamp.enemies[0].is_boss, false, "classification does not grant final-boss combat or loot");
  assert.equal(desert.enemies[0].enemy_type, "regular");
  assert.equal(db.settings().size, 1);
});

test("type transitions preserve the Rare requirement and clear Mini boss metadata", async () => {
  const db = fixture();await addClearingEnemy(db, "swamp", "snake", "mini_boss");
  const id = (await getClearingConfig(db, "swamp")).enemies[0].id;
  await assert.rejects(changeClearingEnemyType(db, id, "boss"), /Rare drop/);
  assert.equal((await getClearingConfig(db, "swamp")).enemies[0].enemy_type, "mini_boss");
  db.rare = true;await changeClearingEnemyType(db, id, "boss");
  assert.equal((await getClearingConfig(db, "swamp")).enemies[0].is_boss, true);assert.equal(db.settings().size, 0);
  await changeClearingEnemyType(db, id, "mini_boss");await changeClearingEnemyType(db, id, "regular");
  assert.equal((await getClearingConfig(db, "swamp")).enemies[0].enemy_type, "regular");assert.equal(db.settings().size, 0);
});

test("removal cleans its metadata and failed metadata writes roll back the assignment", async () => {
  const db = fixture();await addClearingEnemy(db, "swamp", "snake", "regular");
  const id = (await getClearingConfig(db, "swamp")).enemies[0].id;
  db.failSettings = true;await assert.rejects(changeClearingEnemyType(db, id, "mini_boss"), /Settings unavailable/);
  assert.equal((await getClearingConfig(db, "swamp")).enemies[0].enemy_type, "regular");
  await assert.rejects(addClearingEnemy(db, "swamp", "frog", "mini_boss"), /Settings unavailable/);
  assert.equal((await getClearingConfig(db, "swamp")).enemies.length, 1);
  db.failSettings = false;await changeClearingEnemyType(db, id, "mini_boss");assert.equal(await removeClearingEnemy(db, id), "swamp");
  assert.equal(db.settings().size, 0);assert.equal((await getClearingConfig(db, "swamp")).enemies.length, 0);
  assert.equal(await removeClearingEnemy(db, id), null);
  await assert.rejects(changeClearingEnemyType(db, "missing", "regular"), /Unknown assignment/);
  await assert.rejects(addClearingEnemy(db, "swamp", "unknown", "regular"), /Unknown enemy/);
});
