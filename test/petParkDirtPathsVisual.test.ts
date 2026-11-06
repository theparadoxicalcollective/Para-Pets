import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirtPatchWorldRect, exposedDirtEdges, paintDirtPaths } from "../client/src/components/PetParkTerrain";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const painter = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
const preview = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");

test("all saved dirt patches preserve their world positions and isometric ground footprints", () => {
  const point = { xPct: 0.38, yPct: 0.61, size: 200 };
  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) {
    for (const level of [1, 2, 3, 4]) {
      const g = parkCameraGeometry(width, height, level);
      const rect = dirtPatchWorldRect(point, g.worldWidth, g.worldHeight);
      assert.ok(Math.abs(rect.x + rect.width / 2 - point.xPct * g.worldWidth) < 1e-8);
      assert.ok(Math.abs(rect.y + rect.height / 2 - point.yPct * g.worldHeight) < 1e-8);
      assert.equal(rect.width, 200);
      assert.equal(rect.height, 100);
    }
  }
});

test("adjoining saved dirt tiles are one opaque painted shape, not separate translucent circles", () => {
  const trace: Array<string | { rect: number[] }> = [];
  const ctx = {
    save() { trace.push("save"); },
    restore() { trace.push("restore"); },
    translate() {}, scale() {},
    beginPath() { trace.push("begin"); },
    rect(...values: number[]) { trace.push({ rect: values }); },
    clip() { trace.push("clip"); },
    fill() { trace.push("fill"); },
    ellipse() {},
    moveTo(...values: number[]) { trace.push({ rect: values }); },
    lineTo(...values: number[]) { trace.push({ rect: values }); },
    closePath() {},
    createLinearGradient() { trace.push("gradient"); return { addColorStop() {} }; },
    fillStyle: "", shadowColor: "", shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
  const view = { viewportWidth: 600, viewportHeight: 800,
    worldWidth: 1200, worldHeight: 1600, scale: 1, panX: -300, panY: -400 };
  const first = { xPct: 0.4, yPct: 0.5, size: 200 };
  const second = { xPct: 0.45, yPct: 0.5, size: 200 };
  paintDirtPaths(ctx, view, [first, second]);
  const expected = [dirtPatchWorldRect(first, 1200, 1600), dirtPatchWorldRect(second, 1200, 1600)];
  const rects = trace.filter((x): x is { rect: number[] } => typeof x !== "string" && "rect" in x);
  assert.deepEqual(rects.slice(1, 9).map(x => x.rect), expected.flatMap(r => [
    [r.x + r.width / 2, r.y], [r.x + r.width, r.y + r.height / 2],
    [r.x + r.width / 2, r.y + r.height], [r.x, r.y + r.height / 2],
  ]));
  const firstFill = trace.indexOf("fill");
  const lastRect = trace.findIndex((x, i) => i > 1 && typeof x !== "string" && x.rect[0] === expected[1].x + expected[1].width / 2);
  assert.ok(firstFill > lastRect, "both tiles enter one common path before the base fill");
  assert.ok(trace.indexOf("clip", firstFill) > firstFill, "world-anchored dirt grain is clipped to the merged fill");
  assert.ok(trace.includes("restore"));
  assert.ok(trace.filter(x => x === "gradient").length > 8, "short varied edge gradients should feather the exposed portions without a single uniform border");
});

test("editing and brush previews use the same path stamps without introducing a new hit-test surface", () => {
  assert.match(page, /dirtPatches=\{dirtPatches\}/);
  assert.match(page, /item\.effectType === "dirt_path" \? null/);
  assert.match(page, /startPlacement\(e, "item", item\)/);
  assert.match(page, /placementSave\.mutate/);
  assert.match(page, /onWheel=\{e =>/);
  assert.match(painter, /ctx\.closePath\(\)/);
  assert.match(painter, /kind === "dirt_path" \? "#624832"/);
  assert.match(preview, /polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\)/);
  assert.doesNotMatch(preview, /radial-gradient\(ellipse at 52% 50%/);
});

test("only outer diamond sides soften: perfectly joined edges remain opaque", () => {
  const width = 1200, height = 1600, size = 150;
  const a = { xPct: .4, yPct: .5, size };
  const b = { xPct: .4 + size / 2 / width, yPct: .5 + size / 4 / height, size };
  assert.equal(exposedDirtEdges([a], width, height).length, 4);
  assert.equal(exposedDirtEdges([a, b], width, height).length, 6, "two shared sides are internal");
  assert.equal(exposedDirtEdges([a, b, a], width, height).length, 6, "duplicate stamps cannot remove exterior fades");
  assert.equal(exposedDirtEdges([a, { ...a, xPct: .9 }], width, height).length, 8);
  const connected = exposedDirtEdges([a,b],width,height);
  assert.ok(!connected.some(edge => edge.cx === a.xPct * width && edge.cy === a.yPct * height &&
    Math.abs((edge.ax+edge.bx)/2 - (a.xPct*width + size/4)) < 1e-7 &&
    Math.abs((edge.ay+edge.by)/2 - (a.yPct*height + size/8)) < 1e-7));
});

test("camera cropping does not create faded seams against an offscreen saved neighbor", () => {
  const width = 1200, height = 1600, size = 150;
  const a = { xPct: .4, yPct: .5, size };
  const b = { xPct: a.xPct + size/2/width, yPct: a.yPct + size/4/height, size };
  // This camera slice includes the shared side and the exposed left of a,
  // but the shared edge must remain absent from the fade set.
  const edges = exposedDirtEdges([a,b],width,height,{left:450,top:750,right:520,bottom:840});
  assert.ok(edges.every(edge => !(
    edge.cx === a.xPct*width &&
    Math.abs((edge.ax+edge.bx)/2 - (a.xPct*width + size/4)) < 1e-7 &&
    Math.abs((edge.ay+edge.by)/2 - (a.yPct*height + size/8)) < 1e-7
  )));
});

test("rest spots are created as effects only, with legacy spots still readable", () => {
  const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx","utf8");
  const server = readFileSync("server/routes/petParkAdmin.routes.ts","utf8");
  assert.match(panel, /option.type === "sleep" \? "Rest Spot \(Sleep Square\)"/);
  assert.doesNotMatch(panel, /value: "sleep_spot", label: "Rest Spot"/);
  assert.doesNotMatch(panel, /setKind\(/);
  assert.match(panel, /kind: "decor", imageData: pendingImage/);
  assert.match(server, /value === "sleep_spot"/);
});

test("outer path feathering is narrow, uneven and world-stable; connecting edges never fade", () => {
  assert.match(painter, /Math\.min\(8, edge\.size \* 0\.055\)/);
  assert.match(painter, /parkTerrainNoise\(seedX \+ i, seedY, 47\)/);
  assert.match(painter, /gradient\.addColorStop\(1, `rgba\(\$\{ground\.rgb\.join\(","\)\},0\)`\)/);
  assert.doesNotMatch(painter, /const fade = Math\.min\(15, edge\.size \* 0\.11\)/);
  const view = { width: 1200, height: 1600 }, size = 150;
  const a = { xPct: 0.4, yPct: 0.5, size };
  const b = { xPct: a.xPct + size / 2 / view.width,
    yPct: a.yPct + size / 4 / view.height, size };
  assert.equal(exposedDirtEdges([a,b],view.width,view.height).length,6);
});
