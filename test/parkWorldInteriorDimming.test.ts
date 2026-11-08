import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HOUSE_INTERIOR_DARKNESS_MIN, HOUSE_INTERIOR_DARKNESS_MAX } from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

test("Pet Park keeps the room mask mounted while editing and protects unsaved darkness", () => {
  const editor = read("client/src/components/PetParkBuildingDetails.tsx");
  const room = read("client/src/components/PetParkInteriorRoom.tsx");
  const renderer = read("client/src/components/HomeInteriorEffect.tsx");
  assert.equal(HOUSE_INTERIOR_DARKNESS_MIN, 0);
  assert.equal(HOUSE_INTERIOR_DARKNESS_MAX, 90);
  assert.match(editor, /darknessSaveInFlight\.current/);
  assert.match(editor, /variables\.interiorDarkness !== undefined/);
  assert.match(editor, /onBlur=\{\(\) => commitDarkness\(\)\}/);
  assert.match(editor, /onPointerUp=\{event => \{ event\.stopPropagation\(\); commitDarkness\(\); \}\}/);
  assert.match(room, /keepMaskMounted=\{editEffects\} transitionMs=\{editEffects \? 0 : 260\}/);
  assert.match(renderer, /!keepMaskMounted && activeLights\.length === 0/);
  assert.match(renderer, /fillOpacity: safeDarkness \/ 100/);
});

test("World Editor persists darkness for each placed building, with no forced 35% mask", () => {
  const page = read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const route = read("server/routes/worldSceneContent.routes.ts");
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensureWorldSceneContentStorage.ts");
  const type = read("shared/worlds/worldSceneContent.ts");
  assert.match(schema, /interiorDarkness: integer\("interior_darkness"\)\.notNull\(\)\.default\(35\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS interior_darkness integer NOT NULL DEFAULT 35/);
  assert.match(type, /interiorDarkness: number/);
  assert.match(route, /saved\.kind !== "building"/);
  assert.match(route, /body\.interiorDarkness < HOUSE_INTERIOR_DARKNESS_MIN/);
  assert.match(route, /body\.interiorDarkness > HOUSE_INTERIOR_DARKNESS_MAX/);
  assert.match(page, /darkness=\{interiorDarkness\}/);
  assert.match(page, /keepMaskMounted transitionMs=\{0\}/);
  assert.match(page, /cache\.setQueryData<WorldSceneContent>\(sceneQueryKey/);
  assert.match(controls, /data-testid="world-editor-interior-darkness-slider"/);
  assert.match(controls, /onInteriorDarknessCommit/);
});

test("one shared darkness mask and optional nighttime artwork in both editors", () => {
  const park = read("client/src/components/PetParkBuildingDetails.tsx");
  const world = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const parkRoom = read("client/src/components/PetParkInteriorRoom.tsx");
  const worldPage = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(parkRoom, /<HomeInteriorDarknessLayer darkness=\{darkness\}/);
  assert.match(parkRoom, /nightImageUrl && <img/);
  assert.match(parkRoom, /opacity: Math\.max\(0, Math\.min\(1, nightStrength\)\)/);
  assert.match(worldPage, /interiorAsset\.nightInteriorImageUrl && <img/);
  assert.match(worldPage, /opacity: previewNightStrength/);
  assert.match(worldPage, /darkness=\{interiorDarkness\}/);
  assert.match(read("client/src/pages/PetParkPage.tsx"), /nightImageUrl=\{fullPageRoom \? null : activeBuilding\.nightInteriorImageUrl\}/);
  for (const editor of [park, world]) {
    assert.match(editor, /Preview/);
    assert.match(editor, /Nighttime interior/i);
    assert.doesNotMatch(editor, /Peak nighttime darkness/);
  }
  assert.doesNotMatch(park, /slider-park-interior-night-darkness/);
  assert.doesNotMatch(world, /world-editor-interior-night-darkness-slider/);
  assert.match(read("shared/schema.ts"), /nightInteriorImageUrl: text\("night_interior_image_url"\)/);
  for (const path of ["server/startup/migrations/ensurePetParkStorage.ts",
      "server/startup/migrations/ensureWorldSceneContentStorage.ts"]) {
    assert.match(read(path), /ADD COLUMN IF NOT EXISTS night_interior_image_url text/);
  }
  assert.match(read("server/routes/petParkAdmin.routes.ts"), /updates\.nightInteriorImageUrl = body\.nightInteriorImageData/);
  assert.match(read("server/routes/worldSceneContent.routes.ts"), /"nightInteriorImageData", "nightInteriorImageUrl", 2400/);
});
