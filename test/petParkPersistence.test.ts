import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  petParkSettings, petParkSceneItems, petParkPlayerSlots,
  petParkDeposits, petParkRewardClaims,
} from "../shared/schema";

const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");

test("Pet Park has dedicated tables and does not reuse Keeper's Central storage", () => {
  for (const table of [petParkSettings, petParkSceneItems, petParkPlayerSlots, petParkDeposits, petParkRewardClaims]) {
    assert.match(getTableConfig(table).name, /^pet_park_/);
  }
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|keepers_central|kc_doors/i);
});

test("new Pet Park is disabled by default and cannot grant player rewards on migration", () => {
  assert.match(migration, /enabled_for_players boolean NOT NULL DEFAULT false/);
  assert.match(migration, /VALUES \('main', false\) ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(migration, /UPDATE users SET|UPDATE user_inventory SET/i);
});

test("slot bounds, active pet uniqueness and idempotent claim ledger have DB constraints", () => {
  assert.match(migration, /unlocked_slots BETWEEN 1 AND 3/);
  assert.match(migration, /slot_number BETWEEN 1 AND 3/);
  assert.match(migration, /pet_park_deposits_slot_active_uidx/);
  assert.match(migration, /pet_park_deposits_pet_active_uidx/);
  assert.match(migration, /WHERE withdrawn_at IS NULL/g);
  assert.match(migration, /pet_park_claim_interval_uidx/);
  assert.match(migration, /earned_duration_ms <= 86400000/);
});

test("essential boot awaits Pet Park storage before accepting routes", () => {
  const boot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
  assert.match(boot, /await ensurePetParkStorage\(\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pet_park_reward_claims/);
});
