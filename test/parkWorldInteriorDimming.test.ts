import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HOUSE_INTERIOR_DARKNESS_MIN, HOUSE_INTERIOR_DARKNESS_MAX } from "../shared/housing";
import { parkInteriorDarkness } from "../shared/parkInteriorDarkness";

const read = (path: string) => readFileSync(path, "utf8");

test("Pet Park keeps the room mask mounted while editing and protects unsaved darkness", () => {
  const editor = read("client/src/components/PetParkBuildingDetails.tsx");
  const room = read("client/src/components/PetParkInteriorRoom.tsx");
  const renderer = read("client/src/components/HomeInteriorEffect.tsx");
  assert.equal(HOUSE_INTERIOR_DARKNESS_MIN, 0);
  assert.equal(HOUSE_INTERIOR_DARKNESS_MAX, 90);
  assert.match(editor, /darknessSaveInFlight\.current/);
  assert.match(editor, /variables\.interiorDarkness !== undefined/);
  assert.match(editor, /onBlur=\{commitDarkness\}/);
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
  assert.match(page, /parkInteriorDarkness\(interiorDarkness, interiorNightDarkness, previewNightStrength\)/);
  assert.match(page, /keepMaskMounted transitionMs=\{0\}/);
  assert.match(page, /cache\.setQueryData<WorldSceneContent>\(sceneQueryKey/);
  assert.match(controls, /data-testid="world-editor-interior-darkness-slider"/);
  assert.match(controls, /onInteriorDarknessCommit/);
});

test("one existing mask smoothly interpolates day and peak nighttime dimming", () => {
  assert.equal(parkInteriorDarkness(30, 80, 0), 30);
  assert.equal(parkInteriorDarkness(30, 80, 0.5), 55);
  assert.equal(parkInteriorDarkness(30, 80, 1), 80);
  assert.equal(parkInteriorDarkness(30, null, 1), 30,
    "previously saved rooms retain their old darkness at night");
  assert.equal(parkInteriorDarkness(30, undefined, 0.75), 30);
  assert.equal(parkInteriorDarkness(60, 30, 1), 60,
    "night is never brighter than day");
  assert.equal(parkInteriorDarkness(-20, 200, 1), 90);
  assert.equal(parkInteriorDarkness(30, 80, Number.NaN), 30);
});

test("both park and world admins persist nighttime values and preview without new darkness layers", () => {
  const park = read("client/src/components/PetParkBuildingDetails.tsx");
  const world = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const parkRoom = read("client/src/components/PetParkInteriorRoom.tsx");
  const worldPage = read("client/src/pages/WorldSceneEditorPage.tsx");
  for (const editor of [park, world]) {
    assert.match(editor, /Peak nighttime darkness/);
    assert.match(editor, /interiorNightDarkness/);
    assert.match(editor, /Preview/);
  }
  assert.match(parkRoom, /darkness=\{parkInteriorDarkness\(darkness, nightDarkness, nightStrength\)\}/);
  assert.match(worldPage, /darkness=\{parkInteriorDarkness\(interiorDarkness, interiorNightDarkness, previewNightStrength\)\}/);
  assert.match(read("client/src/pages/PetParkPage.tsx"), /nightStrength=\{parkLighting\.nightStrength\}/);
  for (const path of ["server/startup/migrations/ensurePetParkStorage.ts",
      "server/startup/migrations/ensureWorldSceneContentStorage.ts"]) {
    assert.match(read(path), /ADD COLUMN IF NOT EXISTS interior_night_darkness integer/);
  }
  assert.match(read("server/routes/petParkAdmin.routes.ts"), /updates\.interiorNightDarkness = body\.interiorNightDarkness/);
  assert.match(read("server/routes/worldSceneContent.routes.ts"), /changes\.interiorNightDarkness = body\.interiorNightDarkness/);
});
