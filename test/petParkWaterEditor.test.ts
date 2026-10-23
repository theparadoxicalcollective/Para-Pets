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
  assert.match(page, /scene\?\.canEditPark && showEditor/);
  assert.match(page, /<PetParkAdminPanel \/>/);
  assert.match(page, /<ParkEffectVisual type=\{item\.effectType\}/);
});

test("existing admin controls still allow movable, resizable, flippable decor and rest spots", () => {
  assert.match(panel, /onPointerDown/);
  assert.match(panel, /onPointerUp/);
  assert.match(panel, /savePlacement\(\{ \.\.\.shown, xPct, yPct \}\)/);
  assert.match(panel, /\+ Size/);
  assert.match(panel, /− Size/);
  assert.match(panel, /Flip horizontally/);
  assert.match(panel, /Interactive rest spot/);
  assert.match(panel, /aspectRatio: `1 \/ \$\{backgroundAspect\}`/);
  assert.match(visual, /prefers-reduced-motion: reduce/);
});
