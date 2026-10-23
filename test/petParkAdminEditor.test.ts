import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const api = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const admin = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

test("Pet Park has its own visible Admin Realm section", () => {
  assert.match(admin, /key: "pet_park"/);
  assert.match(admin, /activeSection === "pet_park" && <PetParkAdminPanel/);
  assert.match(panel, /Pet Park — Scene Editor/);
});
test("park draft editing routes require admin authentication", () => {
  for (const endpoint of [
    'app.get("/api/admin/pet-park", isAdmin',
    'app.put("/api/admin/pet-park/background", isAdmin',
    'app.post("/api/admin/pet-park/items", isAdmin',
    'app.patch("/api/admin/pet-park/items/:id", isAdmin',
    'app.delete("/api/admin/pet-park/items/:id", isAdmin',
  ]) assert.ok(api.includes(endpoint), endpoint);
  assert.match(routes, /registerPetParkAdminRoutes\(app, \{ db, isAdmin, processWorldImage \}\)/);
});
test("draft editor supports background upload, decor, rest spots, reposition, flip, layering and deletion", () => {
  assert.match(panel, /Upload park background/);
  assert.match(panel, /sleep_spot/);
  assert.match(panel, /onPointerDown/);
  assert.match(panel, /onPointerUp/);
  assert.match(panel, /Flip horizontally/);
  assert.match(panel, /Save placement/);
  assert.match(panel, /Remove item/);
  assert.match(api, /processWorldImage\(imageData, 2560\)/);
});
test("draft editor never opens Pet Park or touches coins and reward claims", () => {
  assert.doesNotMatch(api, /enabledForPlayers: true|petParkRewardClaims|update\(users\)|update\(userInventory\)/);
  assert.doesNotMatch(api, /keepers_central|kc_doors|DROP TABLE/i);
  assert.match(panel, /closed to players/);
});
