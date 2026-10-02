import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync("client/src/components/HomeBundleSection.tsx", "utf8");
const editor = readFileSync("client/src/components/HomeSceneSizeEditor.tsx", "utf8");
const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const visitor = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
const routes = readFileSync("server/routes/homeDecor.routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");
const transactions = readFileSync("server/housing/decorTransactions.ts", "utf8");
const schema = readFileSync("shared/schema.ts", "utf8");
const boot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");

test("Home Bundle admin exposes Decor and Object size editors", () => {
  assert.match(admin, /label: "Decor"/);
  assert.match(admin, /label: "Objects"/);
  assert.match(admin, /label: "Home Bundles"/);
  assert.match(admin, /button-edit-decor-/);
  assert.match(admin, /button-edit-object-/);
  assert.match(admin, /<HomeSceneSizeEditor/);
  assert.match(admin, /queryKey: \["\/api\/admin\/home-objects"\]/);
});

test("size editor previews against a Fall Home interior with a safe fallback", () => {
  assert.match(editor, /\/fall\/i\.test\(bundle\.name\)/);
  assert.match(editor, /building => !!building\.interiorImageUrl/);
  assert.match(editor, /bg_home_v2\.png/);
  assert.match(editor, /const displaySize = size/);
  assert.match(editor, /Players start at this size/);
  assert.match(editor, /increase it up to 10px above this Admin size/);
  assert.match(editor, /Admin starting size preview/);
});

test("admin size is stored on both Decor and Object catalogs", () => {
  const matches = schema.match(/homeSceneSize: integer\("home_scene_size"\)\.notNull\(\)\.default\(250\)/g) ?? [];
  assert.equal(matches.length, 2);
  assert.match(boot, /ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS home_scene_size INTEGER NOT NULL DEFAULT 250/);
  assert.match(boot, /ALTER TABLE home_decor_items ADD COLUMN IF NOT EXISTS home_scene_size INTEGER NOT NULL DEFAULT 250/);
});

test("new player placements start from the Admin catalog size", () => {
  assert.match(transactions, /adminSize = decorCatalog\.homeSceneSize/);
  assert.match(transactions, /adminSize = objectCatalog\.homeSceneSize/);
  assert.match(transactions, /size: Math\.max\(60, Math\.min\(500, adminSize\)\)/);
});

test("players can only make bounded size nudges after placement", () => {
  assert.match(owner, /HOME_SCENE_PLAYER_SIZE_DECREASE_STEP/);
  assert.match(owner, /HOME_SCENE_PLAYER_SIZE_INCREASE_STEP/);
  assert.match(owner, /clampHomeScenePlayerSize/);
  assert.match(routes, /clampHomeScenePlayerSize\(placement\.item\.homeSceneSize, Number\(size\)\)/);
  assert.match(storage, /Partial<\{ xPct: number; yPct: number; size: number; flipped: boolean \}>/);
  assert.doesNotMatch(routes, /size: size \?\? 250/);
});

test("Decor, Objects, and Home pets keep saved player-controlled size while moving", () => {
  assert.match(owner, /const displaySize = item\.size/);
  assert.match(visitor, /const displaySize = item\.size/);
  assert.doesNotMatch(owner, /petHouseDepthSize\(item\.size, item\.yPct\)/);
  assert.doesNotMatch(visitor, /petHouseDepthSize\(item\.size, item\.yPct\)/);
  assert.match(owner, /petHouseDisplaySize\(cfg\.size, pet\)/);
  assert.doesNotMatch(owner, /petHouseDepthSize\(cfg\.size, yPct\)/);
  assert.doesNotMatch(visitor, /petHouseDepthSize\(cfg\.size, yPct\)/);
});

test("Object size API is strictly filtered to Object shop items", () => {
  assert.match(routes, /items\.filter\(\(item\) => item\.type === "object"\)/);
  assert.match(routes, /existing\.type !== "object"/);
  assert.match(routes, /return res\.status\(404\)\.json\(\{ message: "Object not found" \}\)/);
});
