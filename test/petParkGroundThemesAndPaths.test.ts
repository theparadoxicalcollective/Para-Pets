import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { PET_PARK_GROUND_THEMES, isParkGroundTheme, parkGroundTheme, parkGroundSize } from "../shared/petParkGround";
import { PARK_TERRAIN_DETAIL_OPTIONS, isPaintableParkTerrainDetail, isParkConnectedPath, isParkTerrainDetail, parkTerrainHeightRatio } from "../shared/petParkTerrainDetails";
import { PARK_GROUND_PALETTES } from "../client/src/lib/petParkGroundPalette";
import { dirtPatchWorldRect, exposedDirtEdges, paintConnectedPaths, waterPathGeometry } from "../client/src/components/PetParkTerrain";
import { PARK_WATER_BASE, PARK_WATER_TEXTURE_URL, PARK_WATER_APPEARANCE, worldWaterStyle } from "../client/src/lib/petParkWaterTexture";
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
  assert.equal(PARK_GROUND_PALETTES.swamp.base, "#263a2a");
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
    moveTo() {}, lineTo() {}, quadraticCurveTo() { trace.push("curve"); }, closePath() {}, rect() {},
    clip() { trace.push("clip"); }, fill() { trace.push("fill"); },
    createPattern(_image: HTMLImageElement, repetition: string) {
      trace.push("pattern:" + repetition); return {};
    },
    fillRect() { trace.push("fillRect"); },
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
    paintConnectedPaths(ctx,view,[a,b],kind,"snow",undefined,undefined,
      kind === "water_path" ? {} as HTMLImageElement : undefined);
    assert.ok(trace.includes("fill"));
    assert.ok(trace.includes("clip"),"one merged path is clipped before texture");
    assert.ok(trace.filter(x=>x==="gradient").length >= 6,"only exposed edges receive alpha-blended bank gradients");
    if (kind === "stone_path") assert.ok(trace.includes("stroke"), "stone retains its grout");
    else {
      assert.equal(trace.filter(x => x === "pattern:repeat").length, 1);
      assert.equal(trace.filter(x => x === "fillRect").length, 1);
      assert.ok(trace.indexOf("pattern:repeat") > trace.lastIndexOf("clip"), "water is painted into the connected union");
      assert.ok(!trace.includes("ellipse") && !trace.includes("stroke"), "no per-stamp or per-frame water marks");
    }
  }
  assert.ok(painter.includes("const ground = groundPalette ?? PARK_GROUND_PALETTES[groundTheme]"),
    "World Editor can supply an optional palette while Pet Park keeps its normal ground default");
  assert.match(painter, /rgba\(\$\{ground\.rgb\.join\(","\)\},0\)/);
  assert.match(painter, /kind === "stone_path"/);
  assert.match(painter, /kind === "water_path"/);
});

test("water texture is a lightweight opaque teal surface with soft, seamless repeating edges", async () => {
  const file = readFileSync("client/public" + PARK_WATER_TEXTURE_URL);
  assert.ok(file.length < 80 * 1024, "one small download regardless of the number of water stamps");
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  assert.equal(channels, 3);
  assert.equal(width, 768);
  assert.equal(height, 512);
  const pixel = (x: number, y: number, c: number) => data[(y * width + x) * channels + c];
  let deep = 0, reflected = 0, teal = 0;
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (g < 65 && b < 90) deep++;
    if (g > 110 && b > 115) reflected++;
    if (Math.min(g, b) > r + 20) teal++;
  }
  assert.ok(teal > width * height * .95);
  assert.ok(deep > width * height * .15);
  assert.ok(reflected > width * height * .015);
  let edgeDifference = 0, interiorDifference = 0;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      edgeDifference += Math.abs(pixel(0, y, c) - pixel(width - 1, y, c));
      interiorDifference += Math.abs(pixel(0, y, c) - pixel(1, y, c));
      interiorDifference += Math.abs(pixel(width - 1, y, c) - pixel(width - 2, y, c));
    }
    for (let x = 0; x < width; x++) {
      edgeDifference += Math.abs(pixel(x, 0, c) - pixel(x, height - 1, c));
      interiorDifference += Math.abs(pixel(x, 0, c) - pixel(x, 1, c));
      interiorDifference += Math.abs(pixel(x, height - 1, c) - pixel(x, height - 2, c));
    }
  }
  assert.ok(edgeDifference / (3 * (width + height)) < 4);
  assert.ok(edgeDifference < interiorDifference * .8 + 3 * (width + height));
  assert.match(PARK_WATER_BASE, /^#[0-9a-f]{6}$/);
  const preview = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");
  assert.match(preview, /PARK_WATER_APPEARANCE\[waterStyle\]\.textureUrl/);
  assert.match(painter, /previous.waterTexture !== waterTexture/, "late texture loading must invalidate cached player rasters");
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

test("water rounds free convex corners only, leaving shared and overlapping contacts intact", () => {
  const width = 1000, height = 1000;
  const tile = (x: number, y: number, size = 200) => ({ xPct: x / width, yPct: y / height, size });
  const a = tile(400, 400), b = tile(500, 450);
  const geometry = (stamps: ReturnType<typeof tile>[]) => waterPathGeometry(stamps, width, height);
  const key = (x: number, y: number) => x * 1000 + ":" + y * 1000;
  assert.equal(geometry([a]).roundedCorners.size, 4);
  assert.deepEqual(geometry([a, a]).roundedCorners, geometry([a]).roundedCorners);
  const adjacent = geometry([a, b]);
  assert.equal(adjacent.roundedCorners.size, 4);
  assert.ok(!adjacent.roundedCorners.has(key(500,400)));
  assert.ok(!adjacent.roundedCorners.has(key(400,450)));
  // A point-touch, partial overlap or smaller stamp must never be cut apart.
  assert.ok(!geometry([a,tile(600,400)]).roundedCorners.has(key(500,400)));
  assert.ok(!geometry([a,tile(535,400,100)]).roundedCorners.has(key(500,400)));
  assert.ok(!geometry([a,tile(490,410,80)]).roundedCorners.has(key(500,400)));
  assert.equal(geometry([a,tile(800,800)]).roundedCorners.size, 8);
  const view = { worldWidth: width, worldHeight: height, viewportWidth: 1000, viewportHeight: 1000, scale: 1, panX: 0, panY: 0 };
  const direct = tracedContext(), cached = tracedContext(), stone = tracedContext();
  paintConnectedPaths(direct.ctx, view, [a,b], "water_path");
  paintConnectedPaths(cached.ctx, view, [a,b], "water_path", "grass", undefined, adjacent.edges, undefined, "teal", adjacent);
  paintConnectedPaths(stone.ctx, view, [a,b], "stone_path");
  assert.deepEqual(direct.trace,cached.trace);
  assert.equal(direct.trace.filter(x=>x==="curve").length,4);
  assert.ok(!stone.trace.includes("curve"));
});

test("world-specific water variants retain the original dimensions, lightweight seamless surface and proper color", async () => {
  assert.equal(worldWaterStyle("haunted_woods"),"haunted");
  assert.equal(worldWaterStyle("volcanic"),"volcanic");
  for (const world of ["swamp","forest","city","snow","unknown"]) assert.equal(worldWaterStyle(world),"teal");
  const original = await sharp("client/public" + PARK_WATER_TEXTURE_URL).raw().toBuffer();
  for (const theme of ["haunted","volcanic"] as const) {
    const file = readFileSync("client/public" + PARK_WATER_APPEARANCE[theme].textureUrl);
    assert.ok(file.length < 80 * 1024);
    const {data,info} = await sharp(file).raw().toBuffer({resolveWithObject:true});
    assert.deepEqual([info.width,info.height,info.channels],[768,512,3]);
    let tinted=0, difference=0;
    for (let i=0;i<data.length;i+=3) {
      const [r,g,b]=[data[i],data[i+1],data[i+2]];
      if (theme==="haunted" ? b>Math.max(r,g)+15 && Math.abs(r-g)<20 : r>g+20 && r>b+20) tinted++;
      difference+=Math.abs(data[i]-original[i]);
    }
    assert.ok(tinted > info.width*info.height*.9);
    assert.ok(difference > info.width*info.height*10);
    let seam=0;
    const pixel=(x:number,y:number,c:number)=>data[(y*info.width+x)*3+c];
    for(let c=0;c<3;c++){
      for(let y=0;y<info.height;y++) seam+=Math.abs(pixel(0,y,c)-pixel(info.width-1,y,c));
      for(let x=0;x<info.width;x++) seam+=Math.abs(pixel(x,0,c)-pixel(x,info.height-1,c));
    }
    assert.ok(seam/(3*(info.width+info.height))<5);
  }
  for (const page of ["WorldSceneEditorPage","WorldScenePlayerPage"]) {
    assert.match(readFileSync("client/src/pages/"+page+".tsx","utf8"), /waterStyle=\{worldWaterStyle\(worldId\)\}/);
  }
  assert.match(readFileSync("client/src/components/world-editor/WorldTerrainBrush.tsx","utf8"), /waterStyle=\{worldWaterStyle\(props.worldId\)\}/);
  assert.match(painter,/previous.view.waterStyle !== view.waterStyle/);
});

test("water uses only the original themed terrain raster, not an animated overlay", () => {
  const painter = readFileSync("client/src/components/PetParkTerrain.tsx","utf8");
  const css = readFileSync("client/src/index.css","utf8");
  const variants = readFileSync("script/generate-park-water-variants.ts","utf8");
  assert.doesNotMatch(painter, /shimmerRef|waterShimmerPath|park-water-shimmer/);
  assert.doesNotMatch(css, /park-water-drift|park-water-shimmer/);
  assert.doesNotMatch(variants, /park-water-shimmer/);
  assert.match(painter, /paintConnectedPaths\(ctx, rasterView, view.waterPatches, "water_path"/);
});
