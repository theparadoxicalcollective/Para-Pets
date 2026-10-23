import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const api = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const sceneApi = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const visual = readFileSync("client/src/components/ParkEffectVisual.tsx", "utf8");

test("uploaded PetPark.JPG becomes default only when background is unset", () => {
  assert.match(migration, /background_url = '\/world-assets\/uploads\/PetPark\.JPG'/);
  assert.match(migration, /WHERE id = 'main' AND background_url IS NULL/);
  assert.match(api, /app.put\("\/api\/admin\/pet-park\/background", isAdmin/);
  assert.match(migration, /'decor', 'sleep_spot', 'effect'/);
});

test("water effects use admin-only persistence and three supported types", () => {
  assert.match(api, /app.post\("\/api\/admin\/pet-park\/items", isAdmin/);
  assert.match(api, /kind === "effect" && !isEffect\(effectType\)/);
  for (const kind of ["waterfall_mist", "water_ripple", "water_shimmer"]) {
    assert.ok(api.includes(kind));
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
  assert.match(panel, /Interactive rest spot/);
  assert.match(page, /parkCameraGeometry\(viewportSize.width, viewportSize.height, backgroundAspect\)/);
  assert.match(visual, /prefers-reduced-motion: reduce/);
});
