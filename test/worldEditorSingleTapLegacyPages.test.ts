import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path: string) => readFileSync(path, "utf8");

test("world selection is a single alpha-tested tap; dragging unselected art or background pans", () => {
  const page = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(page, /pickParkAdminArtwork\(art, event\.clientX, event\.clientY/);
  assert.match(page, /if \(kind === "outdoor" && selectedId !== item\.id\) return false/);
  assert.match(page, /pendingObjectTap\.current = item \? \{/);
  assert.match(page, /Math\.hypot\(event\.clientX - tap\.x, event\.clientY - tap\.y\) < 7/);
  assert.match(page, /setSelectedId\(tap\.id\)/);
  assert.match(page, /if \(objectDrag\.current\?\.id === event\.pointerId\) moveObject\(event\)/);
  assert.match(page, /startCamera\(event\)/);
  assert.match(page, /if \(pinch\.current\) return/);
  assert.match(page, /parkImageHitAt\(image, event\.clientX, event\.clientY, item\.flipped\)/);
  assert.doesNotMatch(page, /lastObjectTap|moveArmedId|doubleTap/);
  assert.match(page, /filter: "drop-shadow\(1px 0 0 #efca79\)/);
  assert.match(page, /onLostPointerCapture=\{endTouch\}/);
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.match(controls, /Drag selected artwork to move/);
  assert.doesNotMatch(controls, /Double-tap artwork to move|Move armed/);
});

test("admin-only old-world page catalog lists actual legacy location backgrounds grouped by world", () => {
  const server = read("server/routes/worldSceneContent.routes.ts");
  const picker = read("client/src/components/world-editor/WorldLegacyPagePicker.tsx");
  assert.match(server, /app\.get\("\/api\/admin\/world-editor\/:worldId\/legacy-pages", isAdmin/);
  assert.match(server, /inArray\(worldLocations\.worldId, WORLD_DEFINITION_LIST\.map\(world => world\.id\)\)/);
  assert.match(server, /isNotNull\(worldLocations\.bgUrl\)/);
  assert.match(server, /validLegacyLocationPage\(db, legacyLocationId\)/);
  assert.match(server, /saved\.kind !== "building"/);
  assert.match(server, /changes\.legacyLocationId = body\.legacyLocationId/);
  assert.match(picker, /Add Old World Page/);
  assert.match(picker, /<optgroup key=\{name\} label=\{name\}>/);
  assert.match(picker, /compact \? "Add Old World Page" : "No old page linked"/);
  assert.match(picker, /compact\?: boolean/);
  assert.match(picker, /value=\{value \?\? ""\}/);
  assert.match(picker, /credentials: "include"/);
});

test("link is per placed building, survives restart, and reuses legacy image without mutating originals", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensureWorldSceneContentStorage.ts");
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const createForm = read("client/src/components/world-editor/WorldSceneCreateForm.tsx");
  const editor = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(schema, /legacyLocationId: varchar\("legacy_location_id"\)\.references\(\(\) => worldLocations\.id, \{ onDelete: "set null" \}\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS legacy_location_id varchar/);
  assert.match(migration, /REFERENCES world_locations\(id\) ON DELETE SET NULL/);
  assert.match(controls, /props\.selected\.legacyLocationId \?\? null/);
  assert.match(controls, /patchLegacyPage\(id\)/);
  assert.match(controls, /legacyLocationId: id/);
  assert.match(controls, /setLegacyChoice\(\{ buildingId, pageId: id \}\)/);
  assert.match(createForm, /legacyLocationId: isBuilding \? legacyLocationId : null/);
  assert.match(editor, /const interiorImageUrl = linkedLegacyPage\?\.bgUrl \?\? interiorAsset\?\.interiorImageUrl/);
  assert.match(editor, /!linkedLegacyPage && interiorAsset\?\.nightInteriorImageUrl/);
  assert.doesNotMatch(editor, /\/api\/world\/\$\{worldId\}\/locations/);
});
