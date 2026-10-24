import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const api = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const sceneApi = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const visual = readFileSync("client/src/components/ParkEffectVisual.tsx", "utf8");
const shared = readFileSync("shared/petParkEffects.ts", "utf8");

test("park uses expandable grass without requiring uploaded terrain art", () => {
  assert.match(migration, /ground_level integer NOT NULL DEFAULT 1/);
  assert.match(api, /app.patch\("\/api\/admin\/pet-park\/ground", isAdmin/);
  assert.doesNotMatch(api, /app.put\("\/api\/admin\/pet-park\/background"/);
  assert.match(migration, /'decor', 'sleep_spot', 'effect'/);
});

test("water effects use admin-only persistence and three supported types", () => {
  assert.match(api, /app.post\("\/api\/admin\/pet-park\/items", isAdmin/);
  assert.match(api, /kind === "effect" && !isParkEffect\(effectType\)/);
  for (const kind of ["waterfall_mist", "water_ripple", "water_shimmer"]) {
    assert.ok(shared.includes(kind));
    assert.ok(panel.includes(kind));
    assert.ok(visual.includes(kind));
  }
  assert.match(sceneApi, /canEditPark: !!player\?\.isAdmin/);
  assert.match(page, /scene\?\.canEditPark && showCreator/);
  assert.match(page, /<PetParkAdminPanel key=\{editorMode\} initialMode=/);
  assert.match(page, /<ParkEffectVisual type=\{item\.effectType\}/);
});

test("in-park editor still moves, resizes, flips and layers water effects, decor and rest spots", () => {
  assert.match(page, /onPointerDown=\{e => startPlacement\(e, "item", item\)\}/);
  assert.match(page, /onPointerUp=\{endPlacement\}/);
  assert.match(page, /placementSave.mutate\(\{ \.\.\.selectedPlacement, \.\.\.placementDraft \}\)/);
  assert.match(page, /\+ Size/);
  assert.match(page, /− Size/);
  assert.match(page, /flipped: !draft.flipped/);
  assert.match(page, /Fine-tune exact placement/);
  assert.match(panel, /Rest Spot/);
  assert.match(page, /parkCameraGeometry\(viewportSize.width, viewportSize.height, groundLevel, zoom\)/);
  assert.match(visual, /prefers-reduced-motion: reduce/);
});
