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

test("legacy indoor placement is rejected without changing reward data", () => {
  assert.match(routes, /app\.patch\("\/api\/pet-park\/deposits\/:id\/placement"/);
  assert.match(routes, /res\.status\(410\)/);
  assert.match(routes, /buildingId: petParkDeposits\.buildingId/);
  assert.match(routes, /checkpointAt: petParkDeposits\.checkpointAt/);
});

test("rooms retain effect interactions but never render pets or draggable pet slots", () => {
  assert.match(page, /<PetParkInteriorRoom/);
  assert.match(page, /onOpenRoom=\{showRoomEffect\}/);
  assert.match(page, /onToggleEffect=\{effect => toggleParkInteriorLight/);
  assert.doesNotMatch(page, /indoorVisiblePets|dropEquippedPetInside|pet-park-interior-slots/);
});
