import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PET_PARK_GROUND_THEMES, isParkGroundTheme, parkGroundTheme, parkGroundSize } from "../shared/petParkGround";
import { PARK_TERRAIN_DETAIL_OPTIONS, isPaintableParkTerrainDetail, isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "../shared/petParkTerrainDetails";
import { PARK_GROUND_PALETTES } from "../client/src/lib/petParkGroundPalette";
import { dirtPatchWorldRect, exposedDirtEdges, paintConnectedPaths } from "../client/src/components/PetParkTerrain";
import { parkExtendPathStroke, parkPathPoint, parkPathGrid } from "../client/src/lib/petParkTerrainBrush";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const brush = readFileSync("client/src/components/PetParkTerrainBrush.tsx", "utf8");
const painter = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
const routes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const scene = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const schema = readFileSync("shared/schema.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");

test("five named ground styles use the original green default, stable geometric world and distinct palettes", () => {
  assert.deepEqual(PET_PARK_GROUND_THEMES.map(x => x.type), ["grass", "snow", "haunted", "swamp", "volcanic"]);
  assert.equal(PARK_GROUND_PALETTES.grass.base, "#2c4934");
  assert.equal(parkGroundTheme(undefined), "grass");
  assert.equal(parkGroundTheme("<script>"), "grass");
  assert.equal(isParkGroundTheme("snow"), true);
  assert.equal(isParkGroundTheme("volcanic"), true);
  assert.equal(isParkGroundTheme("dirt_path"), false);
  assert.equal(new Set(Object.values(PARK_GROUND_PALETTES).map(p => p.base)).size, 5);
  for (const theme of PET_PARK_GROUND_THEMES) {
    assert.ok(PARK_GROUND_PALETTES[theme.type]);
    assert.equal(PARK_GROUND_PALETTES[theme.type].base, theme.swatch);
    for (const key of ["washLight", "washDark", "facetLight", "facetDark", "patchLight", "patchDark", "strokeLight", "strokeDark"] as const) {
      assert.match(PARK_GROUND_PALETTES[theme.type][key], /^rgba\(/);
    }
    assert.deepEqual(parkGroundSize(2), { width: 2700, height: 4050 });
  }
});

test("terrain types expose only dirt/stone/water brush buttons; legacy Stones remain readable", () => {
  assert.deepEqual(PARK_TERRAIN_DETAIL_OPTIONS.map(x => x.type), ["dirt_path", "stone_path", "water_path", "garden_plot"]);
  for (const option of PARK_TERRAIN_DETAIL_OPTIONS) {
    assert.equal(isPaintableParkTerrainDetail(option.type), true);
    assert.equal(isParkConnectedPath(option.type), option.type !== "garden_plot");
    assert.equal(parkTerrainHeightRatio(option.type), .5);
    assert.equal(option.size, 150);
    const artwork = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");
    assert.match(artwork, /type === "stone_path"/);
    assert.match(artwork, /type === "water_path"/);
    assert.match(artwork, /polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\)/);
  }
  assert.equal(isPaintableParkTerrainDetail("stone_patch"), false);
  assert.equal(isParkTerrainDetail("stone_patch"), true);
  assert.equal(isParkConnectedPath("water_shimmer"), false, "water FX are not paint brushes");
  assert.equal(isParkTerrainDetail("water_shimmer"), false);
  assert.match(brush, /const extendStroke = isParkConnectedPath\(type\) \|\| type === "garden_plot" \? parkExtendPathStroke/);
  assert.match(brush, /PARK_TERRAIN_DETAIL_OPTIONS\.map\(option =>/);
  assert.match(brush, /PET_PARK_GROUND_THEMES\.map\(option =>/);
  assert.match(brush, /role="group" aria-label="Pet Park ground style"/);
  assert.match(brush, /\/api\/admin\/pet-park\/ground-theme/);
});

test("all three paths snap to the same 2:1 world-space grid and do not alter camera or pet coordinates", () => {
  for (const option of PARK_TERRAIN_DETAIL_OPTIONS) {
    const size = option.size, world = { width: 1800, height: 2700 };
    const a = parkPathPoint({ u: 0, v: 0 }, world, size);
    const b = parkPathPoint({ u: 4, v: 0 }, world, size);
    const stroke = parkExtendPathStroke([a], b, world, size);
    assert.equal(stroke.length, 5);
    for (const point of stroke) assert.ok(Math.abs(parkPathGrid(point, world, size).v) < 1e-9);
    const rect = dirtPatchWorldRect({ ...a, size }, world.width, world.height);
    assert.equal(rect.width, size);
    assert.equal(rect.height, size / 2);
  }
  assert.match(page, /isParkConnectedPath\(item\.effectType\)/);
  assert.match(page, /parkSnapPathPoint\(point/);
  assert.match(page, /stonePatches=\{stonePatches\} waterPatches=\{waterPatches\}/);
  assert.match(page, /item\.kind === "terrain" && isParkConnectedPath\(item\.effectType\) \? null/);
  assert.match(page, /groundTheme=\{parkGroundTheme\(scene\.groundTheme\)\}/);
  assert.doesNotMatch(page, /DESIGN_W|DESIGN_H|referenceStage/);
});

function tracedContext() {
  const trace: string[] = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
    moveTo() {}, lineTo() {}, closePath() {}, rect() {},
    clip() { trace.push("clip"); }, fill() { trace.push("fill"); },
    stroke() { trace.push("stroke"); }, ellipse() { trace.push("ellipse"); },
    createLinearGradient() { trace.push("gradient"); return { addColorStop() {} }; },
    fillStyle: "", strokeStyle: "", lineWidth: 1, shadowColor: "", shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, trace };
}
test("stone and water render as merged world-space diamonds with only outer edges feathered", () => {
  const world = { width: 1800, height: 2700 }, size = 150;
  const a = { xPct: .5, yPct: .5, size };
  const b = { xPct: .5 + size / 2 / world.width, yPct: .5 + size / 4 / world.height, size };
  const view = { viewportWidth: 820, viewportHeight: 1180, worldWidth: world.width, worldHeight: world.height, scale: 1, panX: -450, panY: -870 };
  assert.equal(exposedDirtEdges([a,b],world.width,world.height).length,6);
  for (const kind of ["stone_path","water_path"] as const) {
    const { ctx, trace } = tracedContext();
    paintConnectedPaths(ctx,view,[a,b],kind,"snow");
    assert.ok(trace.includes("fill"));
    assert.ok(trace.includes("clip"),"one merged path is clipped before texture");
    assert.ok(trace.filter(x=>x==="gradient").length >= 6,"only exposed edges receive alpha-blended bank gradients");
    assert.ok(trace.includes("stroke"),"stone grout and flowing water highlights need subtle variation");
  }
  assert.match(painter, /const ground = groundPalette \\?\\? PARK_GROUND_PALETTES\\[groundTheme\\]/,
    "World Editor can supply an optional palette while Pet Park keeps its normal ground default");
  assert.match(painter, /rgba\(\$\{ground\.rgb\.join\(","\)\},0\)/);
  assert.match(painter, /kind === "stone_path"/);
  assert.match(painter, /kind === "water_path"/);
});

test("theme persists as an admin-only scene property, never as a paint stamp or world expansion", () => {
  assert.match(schema, /groundTheme: text\("ground_theme"\)\.notNull\(\)\.default\("grass"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ground_theme text NOT NULL DEFAULT 'grass'/);
  assert.match(routes, /app\.patch\("\/api\/admin\/pet-park\/ground-theme", isAdmin/);
  assert.match(routes, /if \(!isParkGroundTheme\(groundTheme\)\)/);
  assert.match(scene, /groundTheme: settings\?\.groundTheme \?\? "grass"/);
  assert.match(routes, /set\(\{ groundTheme, updatedAt: new Date\(\) \}\)/);
  assert.doesNotMatch(routes.slice(routes.indexOf('app.patch("/api/admin/pet-park/ground-theme"'),routes.indexOf('app.post("/api/admin/pet-park/buildings"')), /petParkDeposits|petParkSceneItems|groundLevel|coinsPerHour/);
  assert.match(painter, /className="pointer-events-none absolute"/, "overscanned ground still cannot intercept gameplay gestures");
  assert.match(painter, /canvas\.style\.left = -marginX/, "overscan offsets the raster without shifting terrain placements");
});
