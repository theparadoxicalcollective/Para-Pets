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
const oldPageArt = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#284967"/></svg>',
).toString("base64");
const legacyPages = [
  { id:"a0000000-0000-4000-8000-000000000001", worldId:"haunted_woods",
    worldName:"Haunted Woods", name:"Old Manor Hall", type:"scenic", isShop:false, bgUrl:oldPageArt },
  { id:"a0000000-0000-4000-8000-000000000002", worldId:"elysian_bayou",
    worldName:"Elysian Bayou", name:"Janson's Market", type:"shop", isShop:true, bgUrl:oldPageArt },
];
const savedNpcs = [{
  id: "90000000-0000-4000-8000-000000000001",
  type: "npc", worldId: "__npc_catalog__", name: "Wisp Keeper",
  imageUrl: art, specialSkill: '{"animation":"float","messages":["Hello"]}',
}];
const shopMerchandise = {
  id: "70000000-0000-4000-8000-000000000042", name: "Blue Lantern", type: "item",
  price: 150, imageUrl: art, eggImageUrl: null, hatchedImageUrl: null,
};
const interior = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#62513b"/></svg>',
).toString("base64");
const ids = {
  decor: "10000000-0000-4000-8000-000000000001",
  building: "10000000-0000-4000-8000-000000000002",
  plot: "10000000-0000-4000-8000-000000000003",
  spring: "10000000-0000-4000-8000-000000000004",
  room: "10000000-0000-4000-8000-000000000005",
  colored: "10000000-0000-4000-8000-000000000006",
  interiorLamp: "10000000-0000-4000-8000-000000000007",
  interiorColor: "10000000-0000-4000-8000-000000000008",
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
      tapImageUrl: null, interiorImageUrl: interior, nightInteriorImageUrl: interior },
  ];
  const common = {
    worldId, assetId: null, npcId: null, terrainKey: null, effectType: null, effectColor: null,
    interiorDarkness: 35, size: 120, flipped: false, layer: 0, decorEffects: [],
    isWaterSource: false, isShop: false, legacyLocationId: null,
    shopItemIds: [], shopItemPlacements: [],
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
    { ...common, id: ids.colored, kind: "effect", effectType: "colored_light",
      effectColor: "#7b5cff", xPct: .50, yPct: .25, size: 80 },
  ];
  return {
    assets, placements,
    interiorItems: [{
      id: ids.room, worldId, buildingId: ids.building,
      kind: "decor", assetId: ids.decor, effectType: null,
      xPct: .5, yPct: .5, size: 130, flipped: false,
    }, {
      id: ids.interiorLamp, worldId, buildingId: ids.building,
      kind: "effect", assetId: null, effectType: "lamp_light",
      xPct: .72, yPct: .23, size: 40, flipped: false,
    }, {
      id: ids.interiorColor, worldId, buildingId: ids.building,
      kind: "effect", assetId: null, effectType: "colored_light",
      xPct: .34, yPct: .44, size: 34, flipped: false,
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
      if (path === "/api/shop/__npc_catalog__") return route.fulfill({ json: savedNpcs });
      const match = path.match(/^\/api\/admin\/world-editor\/(haunted_woods|swamp)\/(.*)$/);
      if (!match) return route.fulfill({ json: {} });
      const [, worldId, tail] = match;
      const record = worlds[worldId];
      if (req.method() === "GET" && tail === "draft")
        return route.fulfill({ json: record.draft });
      if (req.method() === "GET" && tail === "scene")
        return route.fulfill({ json: record.scene });
      if (req.method() === "GET" && tail === "legacy-pages")
        return route.fulfill({ json: legacyPages });
      if (req.method() === "GET" && tail === "shop-catalog") {
        const type = u.searchParams.get("type") ?? "all";
        const search = (u.searchParams.get("q") ?? "").toLowerCase();
        return route.fulfill({ json: (
          (type === "all" || type === shopMerchandise.type) &&
          shopMerchandise.name.toLowerCase().includes(search)
        ) ? [shopMerchandise] : [] });
      }
      if (req.method() === "GET" && /^buildings\/[^/]+\/shop-stock$/.test(tail)) {
        const buildingId = tail.split("/")[1];
        const building = record.scene.placements.find(p => p.id === buildingId);
        return route.fulfill({ json: building?.shopItemIds?.includes(shopMerchandise.id)
          ? [shopMerchandise] : [] });
      }
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
        // Model the actual DB-returned defaults, not just the POST request.
        // Without shopItemPlacements the newly created shop crashes when
        // entering its room, masking genuine gesture and legacy link tests.
        const created = {
          id, worldId, kind: "decor", assetId: null, npcId: null, effectType: null,
          effectColor: null, terrainKey: null,
          xPct: .5, yPct: .5, size: 100, flipped: false, layer: 0,
          decorEffects: [], isWaterSource: false, isShop: false,
          legacyLocationId: null, shopItemIds: [], shopItemPlacements: [],
          interiorDarkness: 35, interiorNightDarkness: null,
          ...req.postDataJSON(),
        };
        const linkedType = created.kind === "decor" ? record.scene.placements.find(p =>
          p.kind === "decor" && p.assetId === created.assetId) : null;
        if (linkedType) {
          created.isWaterSource = linkedType.isWaterSource;
          created.decorSurface = linkedType.decorSurface ?? "barrier";
        }
        record.scene.placements.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      if (req.method() === "PUT" && tail === "draft") {
        record.draft = { ...record.draft, ...req.postDataJSON(), updatedAt: new Date().toISOString() };
        return route.fulfill({ json: record.draft });
      }
      if (req.method() === "PATCH" && tail.startsWith("placements/")) {
        const id = tail.slice("placements/".length);
        const changes = req.postDataJSON();
        const original = record.scene.placements.find(p => p.id === id);
        const roleEdited = original?.kind === "decor" &&
          ("decorSurface" in changes || "isWaterSource" in changes);
        const linked = roleEdited ? {
          decorSurface: changes.decorSurface ?? original.decorSurface ?? "barrier",
          isWaterSource: changes.isWaterSource ?? original.isWaterSource,
        } : {};
        record.scene.placements = record.scene.placements.map(p =>
          p.id === id ? { ...p, ...changes, ...linked }
            : roleEdited && p.kind === "decor" && p.assetId === original.assetId ? { ...p, ...linked } : p);
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
    try {
      await page.getByTestId("world-scene-editor").waitFor({ state: "visible", timeout: 30_000 });
    } catch (error) {
      console.error("World editor startup diagnostics", {
        name, errors, url: page.url(),
        content: (await page.locator("body").innerText().catch(() => "")).slice(0, 1200),
      });
      throw error;
    }
    await page.getByRole("button", { name: "+ Building" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "+ Building" }).click();
    await page.getByRole("heading", { name: "Add Building" }).waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Building starting size").inputValue(), "300");
    await page.getByLabel("Building name").fill("Enchanted Cottage");
    // The form keeps optional page and shop tools, but hides them until needed.
    assert.equal(await page.getByTestId("world-create-legacy-options").getAttribute("open"),null,
      name+": optional old-world link does not crowd the main building form");
    await page.getByTestId("world-create-legacy-options").locator("summary").click();
    const creationLegacy = page.getByTestId("world-building-legacy-picker")
      .getByTestId("select-world-legacy-page");
    await creationLegacy.waitFor({ state: "visible" });
    await creationLegacy.locator("optgroup").first().waitFor({ state: "attached" });
    assert.equal(await creationLegacy.locator("optgroup").count(), 2,
      name + ": original world pages are grouped by their old world");
    await creationLegacy.selectOption(legacyPages[0].id);
    assert.equal(await page.getByAltText("Old Manor Hall original world page").count(), 1,
      name + ": creator previews original old-world page art");
    await page.getByTestId("world-create-shop-options").locator("summary").click();
    await page.getByRole("switch", { name: "Is Shop building" }).check();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Building exterior image").setInputFiles({
      name: "Cottage.png", mimeType: "image/png", buffer: png,
    });
    const createdBuilding = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST");
    await page.getByTestId("button-create-world-building").click();
    const savedShopBuilding = await (await createdBuilding).json();
    assert.ok(apiWrites.some(w => w.tail === "placements" && w.body.kind === "building" &&
      w.body.size === 300 && w.body.isShop === true &&
      w.body.legacyLocationId === legacyPages[0].id),
      name + ": building created with its original old-world page link");
    assert.equal(await page.getByText("Shop", { exact: true }).count(), 0,
      name+": shop buildings never show a floating map label");
    assert.equal(await page.getByTestId("world-scene-selected-controls")
      .getByTestId("select-world-legacy-page").count(), 0);
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    const details = page.getByTestId("world-edit-building-page");
    await details.locator("summary").click();
    const selectedLegacy = details.getByTestId("select-world-legacy-page");
    assert.equal(await selectedLegacy.inputValue(), legacyPages[0].id,
      name + ": building legacy link is edited in its existing details");
    const linkEdit = page.waitForResponse(r =>
      r.request().method() === "PATCH" && r.url().includes("/placements/"));
    await selectedLegacy.selectOption(legacyPages[1].id);
    await linkEdit;
    assert.equal(await selectedLegacy.inputValue(), legacyPages[1].id,
      name + ": selected building can be linked to a different old world");
    const linkReset = page.waitForResponse(r =>
      r.request().method() === "PATCH" && r.url().includes("/placements/"));
    await selectedLegacy.selectOption(legacyPages[0].id);
    await linkReset;
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "Enter Building" }).click();
    try {
      await page.getByTestId("world-editor-interior").waitFor({ state: "visible", timeout: 9000 });
    } catch (error) {
      console.error("Old-world page interior diagnostics", {
        name,
        assets: worlds.haunted_woods.scene.assets.map(asset => ({
          id: asset.id, kind: asset.kind, hasInterior: Boolean(asset.interiorImageUrl),
        })),
        buildings: worlds.haunted_woods.scene.placements.filter(p => p.kind === "building")
          .map(p => ({ id: p.id, legacyLocationId: p.legacyLocationId, assetId: p.assetId })),
        legacyPages: legacyPages.map(p => p.id),
        roomCount: await page.getByTestId("world-editor-interior").count(),
        controlsCount: await page.getByTestId("world-scene-selected-controls").count(),
        noRoomText: await page.getByText("This building has no interior artwork yet.").count(),
        pageErrors: errors,
        screen: (await page.locator("body").innerText()).slice(-1500),
      });
      throw error;
    }
    assert.equal(await page.getByTestId("world-editor-interior").locator("img").first().getAttribute("src"),
      oldPageArt, name + ": building reuses exact original page image, not a copied asset");

    // World shops share Pet Park's image-based stock picker and tag editing,
    // but every write stays in the World editor, never a player buy endpoint.
    const addShop = page.getByTestId("world-shop-add-item");
    await addShop.waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("world-shop-shelf").count(), 1,
      name + ": an empty shop remains editable");
    await addShop.click();
    await page.getByTestId("world-shop-picker").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Items", exact: true }).click();
    await page.getByRole("option", { name: /Blue Lantern/ }).waitFor({ state: "visible" });
    await Promise.all([
      page.waitForResponse(r => r.url().includes("/placements/" + savedShopBuilding.id) &&
        r.request().method() === "PATCH"),
      page.getByRole("option", { name: /Blue Lantern/ }).click(),
    ]);
    await page.getByRole("button", { name: "Close shop item picker" }).click();
    const merchandise = page.getByTestId("world-shop-merchandise-" + shopMerchandise.id);
    await merchandise.waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("world-shop-tag-coin").count() > 0, true,
      name + ": World and Pet Park use coin-only price tags");
    await merchandise.click();
    const preview = page.getByTestId("world-shop-price-preview");
    await preview.waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("world-scene-controls").count(), 0,
      name + ": selecting merchandise hides overlapping World bottom controls");
    const beforeTag = worlds.haunted_woods.scene.placements.find(p =>
      p.id === savedShopBuilding.id).shopItemPlacements[0];
    const marker = await page.getByTestId("world-shop-price-drag-handle").boundingBox();
    const artBox = await page.getByTestId("world-shop-price-preview-art").boundingBox();
    assert.ok(marker && artBox, name + ": preview and price-tag drag handle are visible");
    const tagSaved = page.waitForResponse(r => r.url().includes("/placements/" + savedShopBuilding.id) &&
      r.request().method() === "PATCH" && r.request().postDataJSON().shopItemPlacements);
    await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
    await page.mouse.down();
    await page.mouse.move(artBox.x + artBox.width * .32, artBox.y + artBox.height * .3, { steps: 4 });
    await page.mouse.up();
    await tagSaved;
    const afterTag = worlds.haunted_woods.scene.placements.find(p =>
      p.id === savedShopBuilding.id).shopItemPlacements[0];
    assert.notDeepEqual([afterTag.priceTagXPct, afterTag.priceTagYPct],
      [beforeTag.priceTagXPct, beforeTag.priceTagYPct],
      name + ": dragging the preview tag persists image-local coordinates");
    await page.getByRole("button", { name: "Done editing item" }).click();
    await page.getByTestId("world-scene-controls").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Exit Room" }).click();
    await page.getByRole("button", { name: "Deselect world object" }).click();

    await page.getByRole("button", { name: "+ Decor" }).click();
    await page.getByRole("heading", { name: "Decor / Objects" }).waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Decoration starting size").inputValue(), "100");
    assert.equal(await page.getByLabel("Water Source").count(), 1);
    assert.equal(await page.getByLabel("Decoration Tap Image").count(), 1);
    assert.equal(await page.getByTestId("world-create-decor-tap-image").getAttribute("open"),null,
      name+": alternate tap artwork is available without taking over the basic form");
    await page.getByTestId("world-create-decor-tap-image").locator("summary").click();
    await page.getByTestId("world-create-decor-effects").locator("summary").click();
    assert.equal(await page.getByTestId("world-decor-add-effect").isVisible(), true,
      name+": creating a decoration retains its attached-effect authoring controls");
    assert.equal(await page.getByTestId("world-create-decor-behavior").isVisible(), true,
      name+": all decor behavior options are legible without an extra disclosure");
    assert.equal(await page.getByLabel("Water Source", { exact: true }).isVisible(), true,
      name+": water refill source remains a visible option");
    await page.getByLabel("Grass", { exact: true }).check();
    assert.equal(await page.getByLabel("Grass", { exact: true }).isChecked(), true,
      name+": Grass can be selected without losing the other editor controls");
    assert.equal(await page.getByText("Artwork Library").count(), 0,
      name + ": creating a decoration must not require a separate asset library");
    await page.getByLabel("Scene item artwork").setInputFiles({
      name: "Haunted Lantern.png", mimeType: "image/png", buffer: png,
    });
    const createdDecor = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST");
    await page.getByTestId("button-create-world-decoration").click();
    const firstDecor = await (await createdDecor).json();
    assert.ok(apiWrites.some(w => w.tail === "assets" && w.body.name === "Haunted Lantern"),
      name + ": decor upload uses its filename without extra naming steps");
    assert.ok(apiWrites.some(w => w.tail === "placements" && w.body.kind === "decor" &&
      w.body.size === 100), name + ": decor is placed in one operation");
    const duplicateButton = page.getByRole("button", { name: "Duplicate world decoration" });
    await duplicateButton.waitFor({ state: "visible" });
    const [duplicateResponse] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST"),
      duplicateButton.click(),
    ]);
    const secondDecor = await duplicateResponse.json();
    assert.ok(apiWrites.filter(w => w.tail === "placements" && w.body.kind === "decor").length >= 2,
      name + ": linked decoration duplicates reuse one uploaded asset");
    assert.equal(firstDecor.assetId, secondDecor.assetId, name + ": linked copies share a decor type");
    assert.equal(secondDecor.decorSurface, "grass",
      name + ": copying a Grass decoration must inherit Grass automatically");
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    const rolePanel = page.getByTestId("world-decoration-behavior");
    await rolePanel.waitFor({ state: "visible" });
    await Promise.all([
      page.waitForResponse(r => r.url().includes("/placements/" + secondDecor.id) &&
        r.request().method() === "PATCH"),
      rolePanel.getByRole("radio", { name: "Ground" }).check(),
    ]);
    assert.ok(worlds.haunted_woods.scene.placements.filter(p =>
      p.kind === "decor" && p.assetId === firstDecor.assetId).every(p => p.decorSurface === "ground"),
      name + ": changing a decor type to Ground updates the original and every linked copy");
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "Deselect world object" }).click();

    await page.getByRole("button", { name: "+ Effects" }).click();
    await page.getByRole("heading", { name: "World Effects" }).waitFor({ state: "visible" });
    assert.ok(await page.getByTestId("world-standalone-light-color").count() === 1,
      name + ": standalone world effects have an admin orb color picker");
    assert.ok(await page.getByTestId("add-world-effect-lamp_light").count() === 1,
      name + ": one color-capable Lamp Light option is available in the World Editor");
    assert.equal(await page.getByTestId("add-world-effect-colored_light").count(), 0,
      name + ": the outdated duplicate new-colored-light option is removed");
    await page.getByRole("button", { name: "Close editor" }).click();
    assert.equal(await page.getByTestId("world-scene-placement-" + ids.decor).count(), 1,
      name + ": world-only decor is rendered");
    const lampCutouts = page.getByTestId("park-outdoor-lamp-neutral-cutout");
    assert.ok(await lampCutouts.count() >= 2,
      name + ": building and decoration lamps use scene-linked, neutral darkness reveals");
    assert.equal(await page.getByTestId("park-outdoor-lamp-warm-spill").count(), 0,
      name + ": no extra amber wash should tint an entire section of the ground");
    assert.ok(await lampCutouts.evaluateAll(circles =>
      circles.every(circle => circle.style.mixBlendMode === "darken")),
      name + ": overlapping fence lamps must not stack brightness toward daylight");
    assert.ok(await page.getByTestId("home-lamp-light-core").count() >= 1,
      name + ": attached lantern uses the amber lamp artwork");
    const coloredCore = page.getByTestId("world-scene-placement-" + ids.colored)
      .getByTestId("home-lamp-light-core");
    assert.equal(await coloredCore.count(), 1,
      name + ": standalone colored orb renders using the lamp core");
    const orbGradient = await coloredCore.evaluate(node => node.style.backgroundImage);
    assert.match(orbGradient, /123,\s*92,\s*255/,
      name + ": the orb color reaches the rendered CSS gradient, not the scenery mask");
    // Test the actual SVG radius against the rendered lamp art on phone and
    // tablet. The small artwork should stay small, with an independently
    // broader illuminated scene for both decorations and building facades.
    const decorFlare = await page.getByTestId("world-editor-decor-effect-lantern-amber").boundingBox();
    const buildingFlare = await page.getByTestId("world-editor-decor-effect-porch-amber").boundingBox();
    const sceneRadii = await lampCutouts.evaluateAll(
      circles => circles.map(circle => Number(circle.getAttribute("r"))));
    assert.ok(decorFlare && buildingFlare && sceneRadii.length >= 2,
      name + ": decor and building lamps each have independently sized illumination");
    assert.ok(sceneRadii[0] > 2 * decorFlare.width,
      name + ": small decoration lamp lights a moderate area beyond its visible flare");
    assert.ok(sceneRadii[1] > 2 * buildingFlare.width,
      name + ": building facade lamp lights beyond its artwork without a broad daylight wash");
    const fadeOffsets = await page.locator('[data-testid="world-editor-auto-day-night"] radialGradient[id$="-light-0"] stop')
      .evaluateAll(stops => stops.map(stop => stop.getAttribute("offset")));
    assert.deepEqual(fadeOffsets, ["0%", "15%", "32%", "52%", "72%", "88%", "100%"],
      name + ": seven neutral grayscale stops fade the light to full night");
    const fadeColors = await page.locator('[data-testid="world-editor-auto-day-night"] radialGradient[id$="-light-0"] stop')
      .evaluateAll(stops => stops.map(stop => stop.getAttribute("stop-color")));
    assert.ok(fadeColors.every(color => {
      const channels = String(color).match(/[0-9]+/g)?.map(Number);
      return channels?.length === 3 && channels.every(channel => channel === channels[0]);
    }),
      name + ": scene brightness must be neutral, not yellow-brown");
    assert.equal(fadeColors.at(-1), "rgb(255, 255, 255)",
      name + ": light edges return smoothly to the original night darkness");

    const worldSprite = page.getByTestId("world-scene-placement-" + ids.decor);
    const atNormalZoom = await worldSprite.boundingBox();
    assert.ok(atNormalZoom);
    // Optional scene settings replace the cramped second header row.
    assert.equal(await page.getByTestId("button-world-options").count(),0);
    await page.getByTestId("button-world-settings").click();
    const zoomSlider=page.getByTestId("input-world-editor-zoom");
    await zoomSlider.waitFor({state:"visible"});
    await zoomSlider.focus();
    await zoomSlider.press("ArrowLeft");
    assert.ok(Number(await zoomSlider.inputValue())<1,
      name+": zoom slider supports fine steps");
    await page.getByTestId("button-world-fit").click();
    const atWideZoom=await worldSprite.boundingBox();
    assert.ok(atWideZoom && atWideZoom.width<atNormalZoom.width*.6,
      name+": Fit shows the full authored world");
    await page.getByRole("button",{name:"Reset world zoom"}).click();
    assert.ok(Math.abs(Number(await zoomSlider.inputValue())-1)<.011);
    await page.getByRole("button",{name:"Close World Settings"}).click();
    const rect=await worldSprite.boundingBox();
    assert.ok(rect, name + ": decoration is in viewport");
    // The outer 26px of the source SVG are transparent. Its rectangular
    // button must not select or move anything when touched there.
    const transparentX = rect.x + rect.width * .03;
    const transparentY = rect.y + rect.height * .03;
    await page.mouse.click(transparentX, transparentY);
    assert.equal(await page.getByTestId("world-scene-selected-controls").count(), 0,
      name + ": transparent PNG padding never selects a World object");

    // A swipe starting on initially unselected art is still a camera gesture.
    // Only a stationary first tap may select, and only a subsequent gesture
    // starting on the selected opaque art may move that object.
    const writesBeforePan = apiWrites.filter(w => w.tail === "placements/" + ids.decor && w.method === "PATCH").length;
    const firstX = rect.x + rect.width / 2, firstY = rect.y + rect.height / 2;
    await page.mouse.move(firstX, firstY);
    await page.mouse.down();
    await page.mouse.move(firstX + 27, firstY + 24, { steps: 6 });
    await page.mouse.up();
    assert.equal(apiWrites.filter(w => w.tail === "placements/" + ids.decor && w.method === "PATCH").length,
      writesBeforePan, name + ": unselected art swipes pan instead of moving decor");
    assert.equal(await page.getByTestId("world-scene-selected-controls").count(), 0,
      name + ": a drag is never mistaken for a first selection tap");

    const rectAfterPan = await worldSprite.boundingBox();
    assert.ok(rectAfterPan);
    const centerX = rectAfterPan.x + rectAfterPan.width / 2;
    const centerY = rectAfterPan.y + rectAfterPan.height / 2;
    await page.mouse.click(centerX, centerY);
    await page.getByTestId("world-scene-selected-controls").waitFor({ state: "visible" });
    assert.equal(apiWrites.filter(w => w.tail === "placements/" + ids.decor && w.method === "PATCH").length,
      writesBeforePan, name + ": selection requires no movement/save/double tap");

    // Background drag must keep the selected decor intact while panning.
    const artTransformBefore = await page.locator("[data-world-editor-artwork]").getAttribute("style");
    await page.mouse.move(26, height * .56);
    await page.mouse.down();
    await page.mouse.move(66, height * .59, { steps: 7 });
    await page.mouse.up();
    await page.waitForFunction(previous =>
      document.querySelector("[data-world-editor-artwork]")?.getAttribute("style") !== previous,
      artTransformBefore);
    assert.equal(apiWrites.filter(w => w.tail === "placements/" + ids.decor && w.method === "PATCH").length,
      writesBeforePan, name + ": holding and dragging the background never moves selected decor");

    // A gesture that BEGINS on the selected opaque pixels moves that object.
    const rectBeforeMove = await worldSprite.boundingBox();
    assert.ok(rectBeforeMove);
    const moveX = rectBeforeMove.x + rectBeforeMove.width / 2;
    const moveY = rectBeforeMove.y + rectBeforeMove.height / 2;
    const moveSaved = page.waitForResponse(r => r.url().includes("/placements/" + ids.decor) && r.request().method() === "PATCH");
    await page.mouse.move(moveX, moveY);
    await page.mouse.down();
    await page.mouse.move(moveX + 22, moveY + 28, { steps: 6 });
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
    assert.equal(await page.getByTestId("world-edit-decor-effects").count(),1,
      name+": selected decor still offers all attached lights and effects");
    // An existing attached light opens its settings automatically. Empty
    // decorations stay compact until their creator expands the section.
    if (await page.getByTestId("world-edit-decor-effects").getAttribute("open") === null)
      await page.getByTestId("world-edit-decor-effects").locator("summary").click();
    assert.equal(await page.getByTestId("world-decor-add-effect").isVisible(),true,
      name+": attached decor effect editor remains usable");
    await page.getByRole("button", { name: "Close editor" }).click();
    await movementBar.waitFor({ state: "visible" });

    // A real interior stays dark across a slider change and subsequent reload.
    // The existing fixture includes an interior lamp, so the SVG mask is live.
    await page.getByRole("button", { name: "Deselect world object" }).click();
    await page.getByTestId("world-scene-placement-" + ids.building).click();
    await page.getByRole("button", { name: "Enter Building" }).click();
    const darknessSlider = page.getByTestId("world-editor-interior-darkness-slider");
    await darknessSlider.waitFor({ state: "visible" });
    assert.equal(await darknessSlider.inputValue(), "35",
      name + ": existing world building has a 35% starting darkness");
    const interiorMask = page.getByTestId("world-editor-interior").getByTestId("home-interior-darkness-layer");
    assert.equal(await interiorMask.evaluate(element => element.tagName.toLowerCase()), "svg",
      name + ": interior uses a consistent SVG darkness mask with an active light");
    assert.equal(await interiorMask.locator("mask circle").count(),2,
      name+": both interior Lamp Light and Colored Light cut out illumination in one room mask");
    assert.equal(await page.getByTestId("world-editor-interior-night-darkness-slider").count(), 0,
      name + ": old nighttime darkness slider is absent");
    const nightInterior = page.getByTestId("world-editor-night-interior-image");
    await nightInterior.waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Preview night world interior lighting" }).click();
    assert.equal(await nightInterior.evaluate(element => element.style.display), "block",
      name + ": night preview shows alternate interior artwork");
    assert.equal(await interiorMask.locator('rect[fill="black"]').evaluate(element =>
      Number(element.style.fillOpacity)), .35,
      name + ": night preview keeps one 35% darkness setting");
    await page.getByRole("button", { name: "Preview day world interior lighting" }).click();
    assert.equal(await nightInterior.evaluate(element => element.style.display), "none",
      name + ": day preview restores daytime artwork");
    const savedDarkness = page.waitForResponse(response =>
      response.url().endsWith("/placements/" + ids.building) &&
      response.request().method() === "PATCH");
    await darknessSlider.focus();
    await darknessSlider.press("End");
    await savedDarkness;
    assert.equal(await darknessSlider.inputValue(), "90",
      name + ": preview keeps the selected 90% darkness after the save");
    assert.equal(await interiorMask.locator('rect[fill="black"]').evaluate(element =>
      Number(element.style.fillOpacity)), .9,
      name + ": room darkness genuinely dims the rendered image");
    assert.equal(apiWrites.filter(write => write.tail === "placements/" + ids.building &&
      write.body.interiorDarkness !== undefined).length, 1,
      name + ": a single keyboard gesture sends one save request");
    await page.getByRole("button", { name: "Exit Room" }).click();
    await page.getByTestId("world-scene-placement-" + ids.building).click();
    await page.getByRole("button", { name: "Enter Building" }).click();
    assert.equal(await page.getByTestId("world-editor-interior-darkness-slider").inputValue(), "90",
      name + ": reopening the building retains its saved darkness");
    await page.getByRole("button", { name: "Exit Room" }).click();
    // The previously selected building intentionally stays selected when
    // leaving its room. Deselect before using the outdoor terrain toolbar.
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
    await page.getByTestId("button-world-settings").click();
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
    assert.equal(await page.getByTestId("world-scene-controls")
      .getByRole("button",{name:"Clear all world terrain"}).count(),0);
    await page.getByTestId("world-settings-clear-terrain").locator("summary").click();
    const cleared = page.waitForResponse(r => r.url().endsWith("/terrain") &&
      r.request().method() === "DELETE");
    await page.getByRole("button", { name: "Clear all world terrain" }).click();
    await cleared;
    assert.ok(apiWrites.some(write => write.worldId === "haunted_woods" && write.tail === "terrain" &&
      write.method === "DELETE"), name + ": one-tap terrain cleanup belongs only to the current world");

    // The + NPC picker uses existing catalog assets and stores no duplicates.
    await page.getByRole("button", { name: "+ NPC" }).click();
    await page.getByRole("heading", { name: "Add NPC" }).waitFor({ state: "visible" });
    const createdNpc = page.waitForResponse(r => r.url().endsWith("/placements") &&
      r.request().method() === "POST");
    await page.getByTestId("button-place-world-npc-" + savedNpcs[0].id).click();
    await createdNpc;
    const npcWrite = apiWrites.find(w => w.tail === "placements" &&
      w.body.kind === "npc" && w.body.npcId === savedNpcs[0].id);
    assert.ok(npcWrite && npcWrite.worldId === "haunted_woods" && npcWrite.body.assetId === null,
      name + ": NPC picker saves the shared NPC reference in this private world only");
    const npcPlaced = worlds.haunted_woods.scene.placements.find(p =>
      p.kind === "npc" && p.npcId === savedNpcs[0].id);
    assert.ok(npcPlaced);
    const npcSprite = page.getByTestId("world-scene-placement-" + npcPlaced.id);
    await npcSprite.waitFor({ state: "visible" });
    assert.equal(await npcSprite.locator("img").getAttribute("src"), art,
      name + ": NPC image is reused from the saved catalog");
    assert.ok((await page.getByTestId("world-scene-selected-controls").innerText()).includes(savedNpcs[0].name),
      name + ": NPC has selection, resize, flip, and edit controls");
    await page.getByRole("button", { name: "Deselect world object" }).click();

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
