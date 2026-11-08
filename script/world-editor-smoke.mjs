import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercises the REAL WorldSceneEditorPage with mocked, isolated admin endpoints.
// Nothing connects to Railway, Pet Park, purchases, or real player inventory.
const moduleId = "/__world-editor-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
  'import {getQueryFn} from "@/lib/queryClient";',
  'import {TooltipProvider} from "@/components/ui/tooltip";',
  'import WorldSceneEditorPage from "@/pages/WorldSceneEditorPage";',
  'import "@/index.css";',
  'const worldId=new URLSearchParams(location.search).get("world")||"haunted_woods";',
  'const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),staleTime:0,retry:false,refetchOnWindowFocus:false}}});',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><TooltipProvider><WorldSceneEditorPage worldId={worldId}/></TooltipProvider></QueryClientProvider>);',
].join("\n");
const server = await createServer({
  server: { host: "127.0.0.1", port: 4194, strictPort: true },
  plugins: [{
    name: "world-editor-fixture",
    resolveId(id) { return id === moduleId ? id : null; },
    load(id) { return id === moduleId ? fixture : null; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="' + moduleId + '"></script></body></html>'));
      });
    },
  }],
});
const art = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect x="26" y="26" width="188" height="188" fill="#927a55"/></svg>',
).toString("base64");
const interior = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#62513b"/></svg>',
).toString("base64");
const ids = {
  decor: "10000000-0000-4000-8000-000000000001",
  building: "10000000-0000-4000-8000-000000000002",
  plot: "10000000-0000-4000-8000-000000000003",
  spring: "10000000-0000-4000-8000-000000000004",
  room: "10000000-0000-4000-8000-000000000005",
};
function makeScene(worldId) {
  if (worldId === "swamp") return {
    assets: [{
      id: "20000000-0000-4000-8000-000000000001", worldId, name: "Bayou Willow",
      kind: "decor", imageUrl: art, tapImageUrl: null, interiorImageUrl: null,
    }],
    placements: [], interiorItems: [],
  };
  const assets = [
    { id: ids.decor, worldId, kind: "decor", name: "Haunted Cedar", imageUrl: art,
      tapImageUrl: art, interiorImageUrl: null },
    { id: ids.building, worldId, kind: "building", name: "Haunted Cabin", imageUrl: art,
      tapImageUrl: null, interiorImageUrl: interior },
  ];
  const common = {
    worldId, assetId: null, terrainKey: null, effectType: null,
    size: 120, flipped: false, layer: 0, decorEffects: [],
    isWaterSource: false, isShop: false, shopItemIds: [], shopItemPlacements: [],
  };
  const placements = [
    { ...common, id: ids.decor, kind: "decor", assetId: ids.decor, xPct: .38, yPct: .43,
      decorEffects: [{ id: "lantern-amber", type: "lamp_light", x: .5, y: .5, size: 42 }] },
    { ...common, id: ids.building, kind: "building", assetId: ids.building,
      xPct: .64, yPct: .63, size: 190,
      decorEffects: [{ id: "porch-amber", type: "lamp_light", x: .5, y: .4, size: 30 }] },
    { ...common, id: ids.plot, kind: "terrain", effectType: "garden_plot",
      terrainKey: "garden_plot:150:0:0", xPct: .5, yPct: .53, size: 150 },
    { ...common, id: ids.spring, kind: "terrain", effectType: "water_path",
      terrainKey: "water_path:150:1:1", xPct: .62, yPct: .5, size: 150 },
  ];
  return {
    assets, placements,
    interiorItems: [{
      id: ids.room, worldId, buildingId: ids.building,
      kind: "decor", assetId: ids.decor, effectType: null,
      xPct: .5, yPct: .5, size: 130, flipped: false,
    }],
  };
}
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [["phone", 390, 844], ["tablet", 834, 1194]]) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [], apiWrites = [], publicWorldRequests = [], petParkRequests = [];
    page.on("pageerror", e => errors.push(e.message));
    const worlds = {
      haunted_woods: { scene: makeScene("haunted_woods"),
        draft: { worldId: "haunted_woods", groundLevel: 1, groundTheme: "haunted", hasSavedDraft: true, updatedAt: null } },
      swamp: { scene: makeScene("swamp"),
        draft: { worldId: "swamp", groundLevel: 1, groundTheme: "swamp", hasSavedDraft: true, updatedAt: null } },
    };
    const crop = {
      id: "crop", seedItemId: "seed", fruitItemId: "fruit", seedName: "Forest Seeds",
      fruitName: "Fruit", ready: true,
      images: { seedPack: art, planted: art, seedling: art, partial: art, grown: art, picked: art, fruit: art },
      drops: { planted: 2, seedling: 2, partial: 2, grown: 2 }, stagePlacements: {},
    };
    let createdIndex = 1;
    let inventory = [
      { inventoryId: "pail", shopItemId: "pail-item", name: "Shared Watering Pail",
        type: "garden_tool", specialType: "watering_pail", quantity: 1, isRefillable: true,
        gardenWaterLeft: 15, isListed: false, imageUrl: art },
      { inventoryId: "hoe", shopItemId: "hoe-item", name: "Hoe", type: "garden_tool",
        specialType: "hoe", quantity: 1, isListed: false, imageUrl: art },
      { inventoryId: "seed", shopItemId: "seed", name: "Forest Seeds", type: "garden_seed",
        quantity: 2, isListed: false, imageUrl: art },
    ];
    await page.route("**/api/**", route => {
      const req = route.request(), u = new URL(req.url()), path = u.pathname;
      if (path.startsWith("/api/pet-park") || path.startsWith("/api/admin/pet-park"))
        petParkRequests.push(path);
      if (path.startsWith("/api/world/")) publicWorldRequests.push(path);
      if (path === "/api/inventory") return route.fulfill({ json: inventory });
      const match = path.match(/^\/api\/admin\/world-editor\/(haunted_woods|swamp)\/(.*)$/);
      if (!match) return route.fulfill({ json: {} });
      const [, worldId, tail] = match;
      const record = worlds[worldId];
      if (req.method() === "GET" && tail === "draft")
        return route.fulfill({ json: record.draft });
      if (req.method() === "GET" && tail === "scene")
        return route.fulfill({ json: record.scene });
      if (req.method() === "GET" && tail === "garden")
        return route.fulfill({ json: {
          serverNow: new Date().toISOString(),
          plots: record.scene.placements.filter(p => p.effectType === "garden_plot").map(p => ({
            plotItemId: p.id, xPct: p.xPct, yPct: p.yPct, size: p.size,
            cropId: null, phase: "empty", waterApplied: 0, harvestReady: false, pickedUntil: null,
          })), crops: [crop],
        } });
      if (req.method() !== "GET") apiWrites.push({ worldId, tail, method: req.method(), body: req.postDataJSON() });
      if (req.method() === "POST" && tail === "assets") {
        const body = req.postDataJSON();
        const id = `30000000-0000-4000-8000-${String(createdIndex++).padStart(12, "0")}`;
        const asset = {
          id, worldId, kind: body.kind, name: body.name,
          imageUrl: art, tapImageUrl: body.tapImageData ? art : null,
          interiorImageUrl: body.interiorImageData ? interior : null,
        };
        record.scene.assets.push(asset);
        return route.fulfill({ status: 201, json: asset });
      }
      if (req.method() === "POST" && tail === "placements") {
        const id = `40000000-0000-4000-8000-${String(createdIndex++).padStart(12, "0")}`;
        const created = { id, worldId, ...req.postDataJSON() };
        record.scene.placements.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      if (req.method() === "PUT" && tail === "draft") {
        record.draft = { ...record.draft, ...req.postDataJSON(), updatedAt: new Date().toISOString() };
        return route.fulfill({ json: record.draft });
      }
      if (req.method() === "PATCH" && tail.startsWith("placements/")) {
        const id = tail.slice("placements/".length);
        record.scene.placements = record.scene.placements.map(p => p.id === id ? { ...p, ...req.postDataJSON() } : p);
        return route.fulfill({ json: record.scene.placements.find(p => p.id === id) });
      }
      if (req.method() === "PATCH" && tail.startsWith("interior-items/")) {
        const id = tail.slice("interior-items/".length);
        record.scene.interiorItems = record.scene.interiorItems.map(p => p.id === id ? { ...p, ...req.postDataJSON() } : p);
        return route.fulfill({ json: record.scene.interiorItems.find(p => p.id === id) });
      }
      if (req.method() === "POST" && tail === "terrain-strokes") {
        const body = req.postDataJSON();
        const items = body.points.map((p, i) => ({
          ...record.scene.placements[0], ...p,
          id: `tile-${apiWrites.length}-${i}`, kind: "terrain", assetId: null,
          effectType: body.type, terrainKey: `${body.type}:150:${i}:${apiWrites.length}`, size: body.size,
        }));
        record.scene.placements.push(...items);
        return route.fulfill({ status: 201, json: { items } });
      }
      if (req.method() === "DELETE" && tail === "terrain") {
        const initial = record.scene.placements.length;
        record.scene.placements = record.scene.placements.filter(p => p.kind !== "terrain");
        return route.fulfill({ json: { deleted: initial - record.scene.placements.length } });
      }
      if (req.method() === "POST" && tail === "terrain-erase") {
        const type = req.postDataJSON().type;
        record.scene.placements = record.scene.placements.filter(p => p.kind !== "terrain" || p.effectType !== type || p.id === ids.plot);
        return route.fulfill({ json: { deleted: 2 } });
      }
      if (req.method() === "POST" && tail.includes("/refill")) {
        const body = req.postDataJSON();
        const pail = inventory.find(item => item.inventoryId === body.inventoryId);
        if (!pail) return route.fulfill({ status: 422, json: { message: "Missing pail" } });
        inventory = inventory.map(item => item.inventoryId === pail.inventoryId
          ? { ...item, gardenWaterLeft: 100 } : item);
        return route.fulfill({ json: { itemName: pail.name, waterLeft: 100, capacity: 100 } });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto("http://127.0.0.1:4194/fixture?world=haunted_woods",
      { waitUntil: "commit", timeout: 30_000 });
    await page.getByTestId("world-scene-editor").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "+ Building" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "+ Building" }).click();
    await page.getByRole("heading", { name: "Add Building" }).waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Building starting size").inputValue(), "300");
    await page.getByLabel("Building name").fill("Enchanted Cottage");
    await page.getByRole("switch", { name: "Is Shop building" }).check();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Building exterior image").setInputFiles({
      name: "Cottage.png", mimeType: "image/png", buffer: png,
    });
    const createdBuilding = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST");
    await page.getByTestId("button-create-world-building").click();
    await createdBuilding;
    assert.ok(apiWrites.some(w => w.tail === "placements" && w.body.kind === "building" &&
      w.body.size === 300 && w.body.isShop === true), name + ": building created in one step with Pet Park shop/size settings");
    await page.getByRole("button", { name: "Deselect world object" }).click();

    await page.getByRole("button", { name: "+ Decor" }).click();
    await page.getByRole("heading", { name: "Decor / Objects" }).waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Decoration starting size").inputValue(), "100");
    assert.equal(await page.getByLabel("Water Source").count(), 1);
    assert.equal(await page.getByLabel("Decoration Tap Image").count(), 1);
    assert.equal(await page.getByText("Artwork Library").count(), 0,
      name + ": creating a decoration must not require a separate asset library");
    await page.getByLabel("Scene item artwork").setInputFiles({
      name: "Haunted Lantern.png", mimeType: "image/png", buffer: png,
    });
    const createdDecor = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST");
    await page.getByTestId("button-create-world-decoration").click();
    await createdDecor;
    assert.ok(apiWrites.some(w => w.tail === "assets" && w.body.name === "Haunted Lantern"),
      name + ": decor upload uses its filename without extra naming steps");
    assert.ok(apiWrites.some(w => w.tail === "placements" && w.body.kind === "decor" &&
      w.body.size === 100), name + ": decor is placed in one operation");
    const duplicateSaved = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Duplicate world decoration" }).click();
    await duplicateSaved;
    assert.ok(apiWrites.filter(w => w.tail === "placements" && w.body.kind === "decor").length >= 2,
      name + ": linked decoration duplicates reuse one uploaded asset");
    await page.getByRole("button", { name: "Deselect world object" }).click();

    await page.getByRole("button", { name: "+ Effects" }).click();
    await page.getByRole("heading", { name: "World Effects" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close editor" }).click();
    assert.equal(await page.getByTestId("world-scene-placement-" + ids.decor).count(), 1,
      name + ": world-only decor is rendered");
    assert.ok(await page.getByTestId("park-outdoor-lamp-warm-spill").count() >= 1,
      name + ": world editor uses warm radius-based lamp illumination");
    const gradients = await page.locator('[data-testid="world-editor-auto-day-night"] radialGradient[id$="-warm"]')
      .count();
    assert.ok(gradients >= 1,
      name + ": the scene lamp renders its soft amber falloff in the existing darkness SVG");
    assert.ok(await page.getByTestId("home-lamp-light-core").count() >= 1,
      name + ": attached lantern uses the amber lamp artwork");

    const worldSprite = page.getByTestId("world-scene-placement-" + ids.decor);
    const atNormalZoom = await worldSprite.boundingBox();
    assert.ok(atNormalZoom);
    // The World Editor must zoom out a little farther than the Pet Park 0.6
    // minimum, while letting admins use the existing scene after zooming.
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom out" }).click();
    const atWideZoom = await worldSprite.boundingBox();
    assert.ok(atWideZoom && atWideZoom.width < atNormalZoom.width * .6,
      name + ": Zoom out reaches a wider world view than the old 0.6 minimum");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    const rect = await worldSprite.boundingBox();
    assert.ok(rect, name + ": decoration is in viewport");
    const moveSaved = page.waitForResponse(r => r.url().includes("/placements/" + ids.decor) && r.request().method() === "PATCH");
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 22, rect.y + rect.height / 2 + 28, { steps: 6 });
    await page.mouse.up();
    await moveSaved;
    assert.ok(apiWrites.some(w => w.worldId === "haunted_woods" && w.tail === "placements/" + ids.decor &&
      w.method === "PATCH" && w.body.xPct !== .38),
      name + ": editor drag must save to its world-specific endpoint");

    // Selecting artwork must leave almost all of the scene accessible for
    // touch dragging. Heavy preview/effects only render in the opt-in sheet.
    const movementBar = page.getByTestId("world-scene-selected-controls");
    const movementBox = await movementBar.boundingBox();
    assert.ok(movementBox && movementBox.height < height * .25,
      name + ": selected controls must not block the upper world canvas");
    assert.equal(await movementBar.locator('[data-testid="world-decoration-artwork-editor"]').count(), 0,
      name + ": selected movement controls must not include the large artwork preview");
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    await page.getByTestId("world-scene-details-panel").waitFor({ state: "visible" });
    await page.getByTestId("world-decoration-artwork-editor").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close editor" }).click();
    await movementBar.waitFor({ state: "visible" });

    // Direct scene actions appear when the selected item is dismissed.
    await page.getByRole("button", { name: "Deselect world object" }).click();
    await page.getByRole("button", { name: "Paint terrain" }).click();
    await page.getByTestId("world-editor-terrain-brush-surface").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Choose terrain brush" }).click();
    await page.getByRole("button", { name: "Stone Path" }).click();
    const surface = await page.getByTestId("world-editor-terrain-brush-surface").boundingBox();
    const sx = surface.x + surface.width * .52, sy = surface.y + surface.height * .62;
    const painted = page.waitForResponse(r => r.url().endsWith("/terrain-strokes") && r.request().method() === "POST");
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx + 30, sy + 25, { steps: 5 }); await page.mouse.up();
    await painted;
    assert.ok(apiWrites.some(w => w.tail === "terrain-strokes" && w.body.type === "stone_path"),
      name + ": painter saves stone tiles into the world draft");
    await page.getByRole("button", { name: "Toggle terrain eraser" }).click();
    const erased = page.waitForResponse(r => r.url().endsWith("/terrain-erase") && r.request().method() === "POST");
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.up();
    await erased;
    assert.ok(apiWrites.some(w => w.tail === "terrain-erase" && w.body.type === "stone_path"),
      name + ": direct eraser only targets selected material");
    // Garden plots are ordinary snapped terrain; there is no planting/test
    // popup in the private world creator.
    await page.getByRole("button", { name: "Toggle terrain eraser" }).click();
    await page.getByRole("button", { name: "Choose terrain brush" }).click();
    await page.getByRole("button", { name: "Garden Plot" }).click();
    const gardenPainted = page.waitForResponse(r => r.url().endsWith("/terrain-strokes") &&
      r.request().method() === "POST");
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.up();
    await gardenPainted;
    assert.ok(apiWrites.some(w => w.worldId === "haunted_woods" &&
      w.tail === "terrain-strokes" && w.body.type === "garden_plot"),
      name + ": garden plots can be painted without opening player farming UI");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const ground = page.getByTestId("pet-park-painterly-terrain");
    assert.equal(await ground.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(57, 52, 65)",
      name + ": Haunted Woods uses a subtle purple world ground");
    await page.getByTestId("button-world-options").click();
    const themeControl = page.getByTestId("select-world-draft-ground-theme");
    await themeControl.selectOption("city");
    const savedCity = page.waitForResponse(r => r.url().endsWith("/draft") && r.request().method() === "PUT");
    await page.getByTestId("button-save-world-draft").click();
    await savedCity;
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('[data-testid="pet-park-painterly-terrain"]')).backgroundColor === "rgb(52, 62, 59)");
    assert.equal(await themeControl.inputValue(), "city",
      name + ": City saves as its own world theme using the original gray palette");
    assert.equal(await page.getByRole("button", { name: "Test Gardening" }).count(), 0,
      name + ": no Test Gardening mode in the world editor");
    await page.getByTestId("button-world-options").click();
    const cleared = page.waitForResponse(r => r.url().endsWith("/terrain") &&
      r.request().method() === "DELETE");
    await page.getByRole("button", { name: "Clear all world terrain" }).click();
    await cleared;
    assert.ok(apiWrites.some(write => write.worldId === "haunted_woods" && write.tail === "terrain" &&
      write.method === "DELETE"), name + ": one-tap terrain cleanup belongs only to the current world");

    // Crossing to another draft cannot display or edit Haunted Woods assets.
    await page.goto("http://127.0.0.1:4194/fixture?world=swamp", { waitUntil: "commit" });
    await page.getByTestId("world-scene-editor").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "+ Decor" }).waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("world-scene-placement-" + ids.decor).count(), 0,
      name + ": Haunted Woods decoration placements are absent from the Bayou world");
    await page.getByRole("button", { name: "+ Decor" }).click();
    assert.equal(await page.getByText("Artwork Library").count(), 0,
      name + ": the same direct creation form works in every world");
    await page.getByRole("button", { name: "Close editor" }).click();
    assert.deepEqual(petParkRequests, [], name + ": no Pet Park editing or gameplay APIs");
    assert.deepEqual(publicWorldRequests, [], name + ": no original world API writes");
    assert.deepEqual(errors, [], name + ": no browser runtime exceptions");
    console.log("PASS " + name + ": isolated world drafts, scenery drag, painting, erasing, and garden plot terrain");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
