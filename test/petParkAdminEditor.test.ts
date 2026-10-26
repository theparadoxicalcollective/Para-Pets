import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const api = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const building = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
const admin = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

test("Pet Park has its own visible Admin Realm section", () => {
  assert.match(admin, /key: "pet_park"/);
  assert.match(admin, /activeSection === "pet_park" && <PetParkAdminPanel mode="settings"/);
  assert.match(panel, /Pet Park — Administration/);
  assert.match(panel, /mode === "settings"/);
});
test("park draft editing routes require admin authentication", () => {
  for (const endpoint of [
    'app.get("/api/admin/pet-park", isAdmin',
    'app.patch("/api/admin/pet-park/ground", isAdmin',
    'app.post("/api/admin/pet-park/items", isAdmin',
    'app.patch("/api/admin/pet-park/items/:id", isAdmin',
    'app.delete("/api/admin/pet-park/items/:id", isAdmin',
  ]) assert.ok(api.includes(endpoint), endpoint);
  assert.match(routes, /registerPetParkAdminRoutes\(app, \{ db, isAdmin, processWorldImage \}\)/);
});
test("admin settings and in-park editor retain grass expansion, assets and object manipulation", () => {
  assert.match(panel, /Pet Park starts with grassy ground/);
  assert.match(park, /Expand Ground/);
  assert.doesNotMatch(panel, /Upload park background/);
  assert.match(panel, /mode === "settings"/);
  assert.match(panel, /mode: "create" \| "settings"/);
  assert.match(panel, /sleep_spot/);
  assert.match(park, /startPlacement\(e, "item"/);
  assert.match(park, /onPointerUp=\{endPlacement\}/);
  assert.match(park, /Fine-tune exact placement/);
  assert.match(park, /flipped: !placementDraft.flipped/);
  assert.match(park, /Drag to move · auto-saves/);
  assert.match(park, /Remove this object from Pet Park/);
  assert.match(building, /Replace park building exterior/);
  assert.match(building, /Save interior effects/);
  assert.match(api, /processWorldImage\(imageData, 1200\)/);
  assert.match(api, /parkGroundSize\(groundLevel\)/);
  assert.doesNotMatch(api, /app.put\("\/api\/admin\/pet-park\/background"/);
});
test("draft editor never opens Pet Park or touches coins and reward claims", () => {
  assert.doesNotMatch(api, /enabledForPlayers: true|petParkRewardClaims|update\(users\)|update\(userInventory\)/);
  assert.doesNotMatch(api, /keepers_central|kc_doors|DROP TABLE/i);
  assert.match(panel, /Player access and earning rates are managed here/);
  assert.doesNotMatch(panel, /Pet Park — Scene Editor/);
});
