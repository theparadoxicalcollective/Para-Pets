import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkGroundSize, parkExpandPoint } from "../shared/petParkGround";
import { getWorldDefinition, WORLD_DEFINITION_LIST } from "../shared/worlds/worldRegistry";
import {
  isEditableWorldSceneId, defaultWorldSceneDraft,
} from "../shared/worlds/worldSceneDraft";
import {
  worldTerrainCell, validDecorEffects, validEffect, validShopIds,
} from "../shared/worlds/worldSceneContent";
import { parkCameraGeometry, parkClampCamera, parkZoomAnchorPan } from "../client/src/lib/petParkCamera";

test("one private editor covers every registered world without Pet Park becoming a world", () => {
  assert.equal(WORLD_DEFINITION_LIST.length, 8);
  for (const world of WORLD_DEFINITION_LIST) {
    assert.ok(getWorldDefinition(world.id));
    assert.equal(isEditableWorldSceneId(world.id), true);
    assert.equal(defaultWorldSceneDraft(world.id).hasSavedDraft, false);
  }
  assert.equal(isEditableWorldSceneId("pet_park"), false);
  assert.equal(isEditableWorldSceneId(""), false);
  assert.equal(isEditableWorldSceneId("../haunted_woods"), false);
});

test("world terrain grid keys remain valid when the author expands the ground", () => {
  for (const type of ["dirt_path", "stone_path", "water_path", "garden_plot"] as const) {
    const old = parkGroundSize(1);
    const starting = worldTerrainCell({ xPct: .51, yPct: .48 }, old, type, 150);
    assert.ok(starting);
    const grown = parkExpandPoint(starting, 1, 4);
    const resized = worldTerrainCell(grown, parkGroundSize(4), type, 150);
    assert.ok(resized);
    assert.equal(resized.key, starting.key, "saved tile address is consistent after expansion");
    assert.ok(Math.abs(resized.xPct - grown.xPct) < 1e-9);
    assert.ok(Math.abs(resized.yPct - grown.yPct) < 1e-9);
  }
});

test("camera zoom stays bounded on phone and tablet without a 390 by 844 reference stage", () => {
  for (const [width, height] of [[390, 844], [834, 1194], [768, 1024]]) {
    const current = parkCameraGeometry(width, height, 3, 1);
    const pan = parkClampCamera({ x: -current.limitX / 2, y: -current.limitY / 2 }, current);
    const larger = parkCameraGeometry(width, height, 3, 1.15);
    const next = parkZoomAnchorPan(pan, current.scale, larger.scale,
      { x: width / 2, y: height / 2 }, larger);
    const oldCenter = (width / 2 - pan.x) / current.scale;
    const newCenter = (width / 2 - next.x) / larger.scale;
    assert.ok(Math.abs(oldCenter - newCenter) < 1e-8);
  }
});

test("world effects exclude pet sleep spots; decoration and shop validations stay strict", () => {
  assert.equal(validEffect("sleep"), false);
  assert.equal(validEffect("waterfall_mist"), true);
  assert.equal(validDecorEffects([{ id: "pet-only", type: "sleep", x: .5, y: .5, size: 40 }]), false);
  assert.equal(validShopIds(["not-a-uuid"]), false);
  const item = "00000000-0000-4000-8000-000000000001";
  assert.equal(validShopIds([item]), true);
  assert.equal(validShopIds([item, item]), false);
});

test("new editor is isolated from the legacy worlds, Pet Park, pet rewards and public purchases", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");
  const editor = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  const sceneRoutes = readFileSync("server/routes/worldSceneContent.routes.ts", "utf8");
  const gardenRoutes = readFileSync("server/routes/worldGarden.routes.ts", "utf8");
  const refillRoutes = readFileSync("server/routes/worldGardenRefill.routes.ts", "utf8");
  const sceneTables = readFileSync("server/startup/migrations/ensureWorldSceneContentStorage.ts", "utf8");
  const gardenTables = readFileSync("server/startup/migrations/ensureWorldGardenStorage.ts", "utf8");
  assert.match(app, /location\.startsWith\("\/world-editor\/"\) && user\.isAdmin/);
  assert.match(map, /button-new-world-edit-/);
  assert.match(editor, /<WorldSceneControls/);
  assert.doesNotMatch(editor, /<WorldGardenPreview|Test Gardening|previewGarden/,
    "the world creator should only author garden plots, not test player farming");
  const brush = readFileSync("client/src/components/world-editor/WorldTerrainBrush.tsx", "utf8");
  assert.match(brush, /garden_plot/);
  assert.match(editor, /<WorldTerrainBrush/);
  assert.match(editor, /safeSetPointerCapture/);
  assert.match(sceneRoutes, /registerWorldSceneContentRoutes/);
  assert.match(gardenRoutes, /worldGardenPlayerPlots/);
  assert.match(refillRoutes, /worldScenePlacements/);
  assert.match(sceneTables, /world_scene_placements/);
  assert.match(gardenTables, /world_garden_player_plots/);
  for (const source of [sceneRoutes, gardenRoutes, refillRoutes]) {
    assert.doesNotMatch(source, /\/api\/admin\/pet-park\//,
      "new worlds must not write to Pet Park admin endpoints");
    assert.doesNotMatch(source, /\/api\/world\//,
      "new worlds remain unpublished; player world routes are untouched");
  }
  assert.doesNotMatch(editor, /<PetAnimator|<PetParkPage/);
  assert.doesNotMatch(editor, /390\s*[*x×]\s*844/);
});

test("world creator keeps Pet Park-style one-step forms without a mandatory asset library", () => {
  const form = readFileSync("client/src/components/world-editor/WorldSceneCreateForm.tsx", "utf8");
  const controls = readFileSync("client/src/components/world-editor/WorldSceneControls.tsx", "utf8");
  const routes = readFileSync("server/routes/worldSceneContent.routes.ts", "utf8");
  assert.match(form, /Building Name/);
  assert.match(form, /Starting building size/);
  assert.match(form, /Is Shop/);
  assert.match(form, /Interior Background \(optional\)/);
  assert.match(form, /WorldDecorEffectEditor/);
  assert.match(form, /Tap Image/);
  assert.match(form, /Starting size/);
  assert.match(form, /Water Source/);
  assert.match(form, /\/assets/);
  assert.match(form, /\/placements/);
  assert.match(controls, /<WorldSceneCreateForm/);
  assert.doesNotMatch(controls, /Artwork Library|Save to This World's Library/,
    "creating a world decoration should not require a separate library workflow");
  assert.match(controls, /Duplicate world decoration/);
  assert.match(controls, /Replace Decoration Artwork/);
  assert.match(controls, /Edit decoration Tap Image/);
  assert.match(routes, /eq\(worldScenePlacements\.worldId, worldId\)/);
  assert.match(routes, /saved\.kind === "decor" && saved\.assetId && "decorEffects" in changes/);
});

test("browser CI includes an actual world editor phone/tablet fixture", () => {
  const workflow = readFileSync(".github/workflows/browser-smoke-pilot.yml", "utf8");
  const smoke = readFileSync("script/world-editor-smoke.mjs", "utf8");
  assert.match(workflow, /node script\/world-editor-smoke\.mjs/);
  assert.match(workflow, /client\/src\/components\/world-editor\/\*\*/);
  assert.match(smoke, /\["phone", 390, 844\]/);
  assert.match(smoke, /\["tablet", 834, 1194\]/);
  assert.match(smoke, /petParkRequests/);
  assert.match(smoke, /publicWorldRequests/);
});
