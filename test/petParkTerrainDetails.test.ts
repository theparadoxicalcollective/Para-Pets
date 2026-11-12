import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isParkTerrainDetail, isPaintableParkTerrainDetail, PARK_TERRAIN_DETAIL_OPTIONS } from "../shared/petParkTerrainDetails";
import { parkExpandPoint, parkGroundSize } from "../shared/petParkGround";
import { parkCameraGeometry } from "../client/src/lib/petParkCamera";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const routes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const artwork = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");

test("only supported ground detail types may be created; unrelated effects stay distinct", () => {
  assert.deepEqual(PARK_TERRAIN_DETAIL_OPTIONS.map(x=>x.type), ["dirt_path", "stone_path", "water_path", "garden_plot"]);
  for(const option of PARK_TERRAIN_DETAIL_OPTIONS) assert.equal(isPaintableParkTerrainDetail(option.type), true);
  for(const legacy of ["stone_patch", "wildflowers", "wild_grass"]) {
    assert.equal(isParkTerrainDetail(legacy), true, "saved legacy stamps must stay readable until cleared");
    assert.equal(isPaintableParkTerrainDetail(legacy), false, "do not allow creating more stock grass or flowers");
  }
  for(const invalid of ["water_shimmer","fire","",null,7,"<script>"]) assert.equal(isParkTerrainDetail(invalid), false);
  assert.match(routes, /kind === "terrain" && !isPaintableParkTerrainDetail\(effectType\)/);
  assert.match(routes, /kind === "effect" && !isParkEffect\(effectType\)/);
  assert.match(routes, /kind === "terrain" && imageData != null/);
  assert.match(routes, /kind === "effect" \|\| kind === "terrain"/);
  assert.match(migration, /'decor', 'sleep_spot', 'effect', 'terrain'/);
});

test("terrain controls reuse admin-authenticated real-world item editing, not a second editor", () => {
  assert.doesNotMatch(page, /\+ Terrain/);
  assert.match(page, /Paint terrain/);
  assert.match(page, /initialMode=\{editorMode\}/);
  assert.doesNotMatch(panel, /initialMode === "terrain"/);
  assert.doesNotMatch(panel, /addTerrain/);
  assert.match(routes, /app\.post\("\/api\/admin\/pet-park\/terrain-strokes"/);
  assert.match(page, /<PetParkTerrainDetail type=\{item.effectType\}/);
  assert.match(page, /onPointerDown=\{e => startPlacement\(e, "item", item\)\}/);
  assert.match(page, /placementSave\.mutate\(\{ \.\.\.selectedPlacement, \.\.\.next \}\)/);
  assert.match(page, /placementDelete\.mutate\(selectedPlacement\)/);
  assert.doesNotMatch(page, /PARK_SELECTED_DEPTH_Z/);
  assert.match(page, /parkDepthIndex\(/);
  assert.match(artwork, /pointer-events-none/);
  assert.match(artwork, /aria-hidden="true"/);
});

test("expanding ground preserves all saved terrain stamp locations relative to park center", () => {
  for(const [previous,next] of [[1,2],[2,3],[3,4]]) {
    const from = parkGroundSize(previous).width;
    const to = parkGroundSize(next).width;
    const coords={xPct:0.23,yPct:0.7};
    const moved=parkExpandPoint(coords,previous,next);
    assert.ok(Math.abs((coords.xPct-0.5)*from-(moved.xPct-0.5)*to)<1e-7);
    for(const [width,height] of [[390,844],[820,1180],[900,1300]]) {
      assert.equal(parkCameraGeometry(width,height,previous).scale,parkCameraGeometry(width,height,next).scale);
    }
  }
  assert.match(routes,/await tx\.update\(petParkSceneItems\)\.set\(/);
  assert.doesNotMatch(routes, /petParkRewardClaims|update\(users\)/);
});

test("decor/effects/pets are preserved and terrain remains a ground-level detail", () => {
  assert.match(page, /item\.kind === "effect" \|\| item\.kind === "sleep_spot" \? 12_000_000 : item\.kind === "terrain" \? 500 : decorDrawDepth/);
  assert.match(page, /decorDrawDepth\(item, parkDepthIndex\(/,
    "ordinary decor retains scene depth while Ground occupies its own layer");
  assert.match(page, /item\.kind === "effect" && item\.effectType/);
  assert.match(page, /<ParkEffectVisual type=\{item.effectType\}/);
  assert.match(page, /<PetAnimator petTemplateId=\{pet.petTemplateId\}/);
  assert.doesNotMatch(page, /PetParkGroundShadow|pet-park-contact-shadow/, "outdoor pet shadows were intentionally removed");
  assert.match(page, /<PetParkTerrain/);
  assert.match(page, /onWheel=\{e =>/);
});
