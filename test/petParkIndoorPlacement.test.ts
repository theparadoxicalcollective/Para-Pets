import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { petParkInteriorDropPoint } from "../client/src/lib/petParkInteriorDrop";

const schema = readFileSync("shared/schema.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const routes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("old indoor coordinates remain compatible with saved deposits and migrations", () => {
  for (const field of ['buildingId: varchar("building_id")', 'roomEffectId: varchar("room_effect_id")',
    'interiorXPct: real("interior_x_pct")', 'interiorYPct: real("interior_y_pct")',
    'pose: text("pose")']) assert.ok(schema.includes(field), field);
  for (const column of ["building_id", "room_effect_id", "interior_x_pct", "interior_y_pct"])
    assert.ok(migration.includes(column), column);
  assert.match(schema, /petParkRewardClaims = pgTable\("pet_park_reward_claims"/);
});

test("old indoor placement route rejects new attempts without touching reward data", () => {
  assert.match(routes, /app\.patch\("\/api\/pet-park\/deposits\/:id\/placement", isAuthenticated/);
  assert.match(routes, /res\.status\(410\)/);
  const handler = routes.split('app.patch("/api/pet-park/deposits/:id/placement"')[1].split("// Collection and withdrawal")[0];
  assert.doesNotMatch(handler, /tx\.update|checkpointPetParkClaim|settleDeposit|petParkRewardClaims/);
});

test("indoors allows tapping effects and portals, but no pet rendering or movement", () => {
  assert.match(page, /<PetParkInteriorRoom/);
  assert.match(page, /onOpenRoom=\{showRoomEffect\}/);
  assert.match(page, /onToggleEffect=\{effect => toggleParkInteriorLight/);
  assert.match(page, /fullPageRoom\?\.imageUrl/);
  assert.match(page, /View-only · No pet placement/);
  assert.doesNotMatch(page, /indoorVisiblePets|indoorSlotPointer|pet-park-interior-slots/);
  assert.doesNotMatch(page, /api\/pet-park\/deposits\/\$\{drag\.petId\}\/placement/);
});

test("legacy panned-room coordinate helper is retained for older saved data", () => {
  const point = petParkInteriorDropPoint({ x: 150, y: 400 },
    { left: 0, top: 40, width: 400, height: 760 },
    { left: -300, top: 40, width: 1200, height: 760 });
  assert.ok(point);
  assert.equal(point.xPct, 0.375);
  assert.equal(point.yPct, 360 / 760);
});
