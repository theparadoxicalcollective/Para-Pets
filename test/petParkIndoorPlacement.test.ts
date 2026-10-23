import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("shared/schema.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const routes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("indoor placement is additive on existing deposits and migration is repeatable", () => {
  for (const field of ['buildingId: varchar("building_id")', 'interiorXPct: real("interior_x_pct")', 'interiorYPct: real("interior_y_pct")', 'pose: text("pose")']) assert.ok(schema.includes(field), `missing schema field ${field}`);
  for (const field of ["building_id", "interior_x_pct", "interior_y_pct", "ADD COLUMN IF NOT EXISTS pose"]) assert.ok(migration.includes(field), `missing migration ${field}`);
  assert.match(migration, /pose IN \('idle', 'sit', 'sleep'\)/);
  assert.match(schema, /petParkRewardClaims = pgTable\("pet_park_reward_claims"/);
});

test("placement endpoint authorizes owner, validates normalized coordinates and enforces shared building capacity", () => {
  assert.match(routes, /app\.patch\("\/api\/pet-park\/deposits\/:id\/placement"/);
  assert.match(routes, /eq\(petParkDeposits\.userId, userId\)/);
  assert.match(routes, /xPct < 0 \|\| xPct > 1/);
  assert.match(routes, /!\["idle", "sit", "sleep"\]\.includes\(pose\)/);
  assert.match(routes, /occupants\.length >= building\.maxPets/);
  assert.match(routes, /buildingId: petParkDeposits\.buildingId/);
  assert.match(routes, /checkpointAt: petParkDeposits\.checkpointAt/);
});

test("interior shows shared occupants, permits own-pet placement and keeps indoor pets out of outdoor roster", () => {
  assert.match(page, /const outdoorPets = .*filter\(pet => !pet\.buildingId\)/);
  assert.match(page, /pet\.buildingId === activeBuilding\.id/);
  assert.match(page, /Move \{deposit\.petNickname \|\| deposit\.petName\} inside/);
  assert.match(page, /\["idle","sit","sleep"\] as const/);
  assert.match(page, /Move \{deposit\.petNickname \|\| deposit\.petName\} outside/);
  assert.match(page, /api\/pet-park\/deposits\/\$\{deposit\.id\}\/placement/);
});
