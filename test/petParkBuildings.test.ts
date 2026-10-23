import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("shared/schema.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const adminRoutes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const playerRoutes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const adminPanel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const interiorRoom = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
const buildingDetails = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("Pet Park buildings persist exterior, interior, capacity, normalized placement and shared interior effects", () => {
  assert.match(schema, /export const petParkBuildings = pgTable\("pet_park_buildings"/);
  for (const field of ["image_url", "interior_image_url", "max_pets", "interior_effects", "x_pct", "y_pct"]) assert.ok(migration.includes(field), `missing migration field ${field}`);
  assert.match(migration, /max_pets BETWEEN 1 AND 3/);
  assert.match(adminRoutes, /app\.post\("\/api\/admin\/pet-park\/buildings"/);
  assert.match(adminRoutes, /app\.patch\("\/api\/admin\/pet-park\/buildings\/:id"/);
  assert.match(adminRoutes, /app\.delete\("\/api\/admin\/pet-park\/buildings\/:id"/);
  assert.match(adminRoutes, /sanitizeHouseInteriorEffects/);
  assert.match(adminPanel, /Building exterior image/);
  assert.match(adminPanel, /Building interior image/);
  assert.match(adminPanel, /Building pet capacity/);
  assert.match(interiorRoom, /HomeInteriorEffectsLayer/);
  assert.match(buildingDetails, /HOME_INTERIOR_EFFECT_OPTIONS/);
  assert.match(buildingDetails, /Edit building:/);
});

test("saved buildings reach the scene and can open their configured interior", () => {
  assert.match(playerRoutes, /from\(petParkBuildings\)/);
  assert.match(playerRoutes, /buildings, rates:/);
  assert.match(playerRoutes, /items, deposits, sharedPets/);
  assert.match(page, /Enter \$\{building\.name\}/);
  assert.match(page, /activeBuilding\.interiorImageUrl/);
  assert.match(page, /activeBuilding\.interiorEffects/);
  assert.match(page, /Park-wide limit remains three per player/);
  assert.match(page, /activeBuilding\.maxPets/);
});
