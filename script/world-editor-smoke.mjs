import assert from "node:assert/strict";
import { createServer } from "vite";
import sharp from "sharp";
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
const savedMiniPet = {
  shopItemId: "91000000-0000-4000-8000-000000000001", name: "Willow Wisp",
  imageUrl: art, animationStyle: "breath",
  parts: [{id:"body",partType:"body",imageUrl:art},{id:"eyes",partType:"eyes",imageUrl:art},{id:"closed",partType:"closed_eyes",imageUrl:art}],
};
const shopMerchandise = {
  id: "70000000-0000-4000-8000-000000000042", name: "Blue Lantern", type: "item",
  price: 150, imageUrl: art, eggImageUrl: null, hatchedImageUrl: null,
};
const interior = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#62513b"/></svg>',
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
    { ...common, id: "test-water-ripple", kind: "effect", effectType: "water_ripple", xPct: .47, yPct: .60, size: 100 },
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
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}) });
try {
  for (const [name, width, height] of [["phone", 390, 844], ["tablet", 834, 1194]]) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true,
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    // The world editor uses a real day/night clock. This fixture asserts the
    // FULL-NIGHT neutral lamp peak, so pin it to 23:00 instead of allowing CI
    // to run during the 05:30–06:00 dawn fade and incorrectly fail the peak
    // assertion. Only Date is fixed: browser timers, gestures, and transitions
    // continue operating normally (unlike a frozen timer mock).
    await page.clock.setFixedTime(new Date("2026-11-12T23:00:00.000Z"));
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
      if (path === "/api/admin/mini-pets") return route.fulfill({ json: [savedMiniPet] });
      if (path === "/api/shop/__npc_catalog__") return route.fulfill({ json: savedNpcs });
      const match = path.match(/^\/api\/admin\/world-editor\/(haunted_woods|swamp)\/(.*)$/);
      if (!match) return route.fulfill({ json: {} });
      const [, worldId, tail] = match;
      const record = worlds[worldId];
      if (req.method() === "PUT" && tail === "publication")
        throw new Error("The editor must not publish or switch worlds");
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
      if (req.method() === "PATCH" && tail.startsWith("assets/")) {
        const id = tail.slice("assets/".length);
        const asset = record.scene.assets.find(a => a.id === id);
        const body = req.postDataJSON();
        if (!asset) return route.fulfill({ status: 404, json: { message: "Asset not found in this world" } });
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80)
          return route.fulfill({ status: 400, json: { message: "Invalid asset name" } });
        asset.name = body.name.trim();
        return route.fulfill({ json: asset });
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
        if (created.kind === "mini_pet") record.scene.miniPets = [savedMiniPet];
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
      if (req.method() === "POST" && tail === "interior-items") {
        const item = { id: `50000000-0000-4000-8000-${String(createdIndex++).padStart(12, "0")}`,
          worldId, ...req.postDataJSON() };
        record.scene.interiorItems.push(item);
        return route.fulfill({ status: 201, json: item });
      }
      if (req.method() === "DELETE" && tail.startsWith("interior-items/")) {
        record.scene.interiorItems = record.scene.interiorItems.filter(item => item.id !== tail.slice("interior-items/".length));
        return route.fulfill({ json: { deleted: true } });
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
    const placedRipple = page.getByTestId("world-scene-placement-test-water-ripple").locator(".park-water-effect--water_ripple");
    await placedRipple.waitFor();
    assert.equal(await placedRipple.evaluate(el => getComputedStyle(el, ":before").borderTopColor), "rgba(190, 197, 239, 0.8)");
    // The night editor uses the same sharp, static themed terrain as players.
    // Admin-placed ripple effects remain available (asserted above).
    await page.waitForFunction(() => document.querySelector('[data-testid="pet-park-painterly-terrain"]')?.dataset.parkWaterTexture === "ready");
    assert.equal(await page.getByTestId("park-water-shimmer").count(),0);
    const worldArt = await page.locator("[data-world-editor-artwork]").boundingBox();
    const waterCenter = { x: worldArt.x + .62 * worldArt.width, y: worldArt.y + .5 * worldArt.height };
    const waterWidth = Math.round(worldArt.width * 150 / 1800 * .48);
    const waterHeight = Math.round(waterWidth / 2);
    const clip = { x: Math.round(waterCenter.x - waterWidth/2), y: Math.round(waterCenter.y - waterHeight/2), width: waterWidth, height: waterHeight };
    const beforeWater = await sharp(await page.screenshot({clip})).removeAlpha().raw().toBuffer();
    await page.waitForTimeout(600);
    const afterWater = await sharp(await page.screenshot({clip})).removeAlpha().raw().toBuffer();
    const meanWater = beforeWater.reduce((sum,value,i)=>sum+Math.abs(value-afterWater[i]),0)/beforeWater.length;
    assert.ok(meanWater<.1,name+": static water at night; pixel difference "+meanWater);

    // Mobile software keyboards shrink/shift the visible app stage without
    // necessarily changing layout viewport units. Exercise the real editor
    // fields with that geometry, including a genuine browser clipboard paste.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const editNameWithKeyboard = async (input, value, saveButton) => {
      const stage = page.locator("#game-stage");
      const originalStyle = await stage.getAttribute("style");
      const beforeWrites = apiWrites.length;
      await input.tap();
      assert.ok(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16 &&
        getComputedStyle(el).userSelect === "text" && el.autocomplete === "off" &&
        el.dataset.iosEdgeControl === "true"), name + ": native name editing is large and selectable");
      await stage.evaluate((el, height) => {
        el.style.top = "22px";
        el.style.height = Math.floor(height * .51) + "px";
      }, height);
      await page.waitForFunction(() => {
        const input = document.activeElement;
        const body = document.querySelector('[data-testid="world-scene-creator-scroll"]');
        const sheet = document.querySelector('[data-testid="world-scene-creator-panel"]');
        const stage = document.querySelector("#game-stage");
        if (!input?.matches("[data-world-name-input]") || !body || !sheet || !stage) return false;
        const a = input.getBoundingClientRect(), b = body.getBoundingClientRect();
        const c = sheet.getBoundingClientRect(), d = stage.getBoundingClientRect();
        return a.height >= 40 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 &&
          c.top >= d.top - 1 && c.bottom <= d.bottom + 1;
      });
      await input.press("Control+a");
      await page.keyboard.insertText("Temporary text");
      assert.equal(await input.inputValue(), "Temporary text");
      await page.evaluate(text => navigator.clipboard.writeText(text), value);
      await input.press("Control+a");
      await input.press("Control+v");
      await page.waitForFunction(value => document.activeElement?.value === value, value);
      assert.equal(apiWrites.length, beforeWrites, name + ": typing and paste never save or move an object");
      if (saveButton) {
        const saveBounds = await saveButton.boundingBox(), sheetBounds = await page.getByTestId("world-scene-creator-scroll").boundingBox();
        assert.ok(saveBounds && sheetBounds && saveBounds.y >= sheetBounds.y - 1 &&
          saveBounds.y + saveBounds.height <= sheetBounds.y + sheetBounds.height + 1,
          name + ": Save Name remains reachable with the keyboard open");
      }
      return async () => {
        await input.evaluate(el => el.blur()).catch(() => {});
        await stage.evaluate((el, style) => el.setAttribute("style", style), originalStyle);
        await page.waitForFunction(height => Math.abs(document.querySelector("#game-stage").getBoundingClientRect().height - height) < 2, height);
      };
    };
    if (name === "phone") {
      const result = await page.evaluate(async () => {
        const { readWorldArtwork } = await import("/src/lib/worldArtworkUpload.ts");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 2200;
        const ctx = canvas.getContext("2d");
        const pixels = ctx.createImageData(2200, 2200);
        let seed = 192837;
        for (let i = 0; i < pixels.data.length; i += 4) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          pixels.data[i] = seed & 255;
          pixels.data[i + 1] = (seed >>> 8) & 255;
          pixels.data[i + 2] = (seed >>> 16) & 255;
          pixels.data[i + 3] = i < 2200 * 4 * 200 ? 0 : 255;
        }
        ctx.putImageData(pixels, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const data = await readWorldArtwork(new File([blob], "large-transparent.png", { type: "image/png" }));
        const decoded = new Image();
        decoded.src = data;
        await decoded.decode();
        canvas.width = decoded.naturalWidth;
        canvas.height = decoded.naturalHeight;
        ctx.drawImage(decoded, 0, 0);
        return { inputBytes: blob.size, outputBytes: data.length, width: decoded.naturalWidth,
          height: decoded.naturalHeight, alpha: ctx.getImageData(10, 10, 1, 1).data[3] };
      });
      assert.ok(result.inputBytes > 6_000_000, "fixture exceeds the original upload limit");
      assert.ok(result.outputBytes < 8_000_000, "large artwork is optimized below the old request limit");
      assert.equal(result.width, 2000);
      assert.equal(result.height, 2000);
      assert.equal(result.alpha, 0, "transparent artwork retains transparent pixels");
    }

    await page.getByRole("button", { name: "+ Building" }).click();
    await page.getByRole("heading", { name: "Add Building" }).waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Building starting size").inputValue(), "300");
    const restoreNewName = await editNameWithKeyboard(page.getByLabel("Building name"), "Enchanted Cottage");
    await restoreNewName();
    // New buildings are independent; their gameplay can be connected through
    // future code changes without a page-link selector in the editor.
    assert.equal(await page.getByTestId("world-create-legacy-options").count(), 0,
      name + ": creation no longer exposes an old-world link option");
    assert.equal(await page.getByLabel("Add Old World Page").count(), 0);
    await page.getByTestId("world-create-shop-options").locator("summary").click();
    await page.getByRole("switch", { name: "Is Shop building" }).check();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Building exterior image").setInputFiles({
      name: "Cottage.png", mimeType: "image/png", buffer: png,
    });
    await page.getByAltText("New building preview").waitFor();
    await page.getByTestId("world-create-interior-artwork").locator("summary").click();
    await page.getByLabel("Building interior image").setInputFiles({
      name: "Cottage Room.png", mimeType: "image/png", buffer: png,
    });
    await page.getByAltText("Interior background preview").waitFor();
    const createdBuilding = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method() === "POST");
    await page.getByTestId("button-create-world-building").click();
    const savedShopBuilding = await (await createdBuilding).json();
    assert.ok(apiWrites.some(w => w.tail === "placements" && w.body.kind === "building" &&
      w.body.size === 300 && w.body.isShop === true &&
      w.body.legacyLocationId === null),
      name + ": new building starts without an old-world page link");
    assert.equal(await page.getByText("Shop", { exact: true }).count(), 0,
      name+": shop buildings never show a floating map label");
    assert.equal(await page.getByTestId("world-scene-selected-controls")
      .getByTestId("select-world-legacy-page").count(), 0);
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    assert.equal(await page.getByTestId("world-edit-building-page").count(), 0);
    assert.equal(await page.getByLabel("Add Old World Page").count(), 0);
    assert.equal(await page.getByTestId("world-edit-original-hotspot").count(), 0,
      name + ": unlinked buildings have no legacy-specific controls");
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "Enter Building" }).click();
    await page.getByTestId("world-editor-interior").waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("world-editor-interior").locator("img").first().getAttribute("src"),
      interior, name + ": standalone building uses its own saved interior artwork");
    const shopArt = page.getByTestId("world-editor-interior");
    const shopAddButton = page.getByTestId("world-shop-add-item");
    const shopButtonBefore = await shopAddButton.boundingBox();
    const shopArtBefore = await shopArt.boundingBox();
    await page.mouse.move(width * .8, height * .32);
    await page.mouse.down();
    await page.mouse.move(width * .2, height * .32, { steps: 6 });
    await page.mouse.up();
    assert.ok((await shopArt.boundingBox()).x < shopArtBefore.x - 50,
      name + ": shop artwork pans like an ordinary room");
    assert.deepEqual(await shopAddButton.boundingBox(), shopButtonBefore,
      name + ": shop Add Item stays onscreen while artwork pans");
    await page.getByRole("button", { name: "Exit Room" }).click();

    // Model a link already saved before the UI was removed. Refresh the real
    // editor, and verify it never clears that link or loses its original room.
    worlds.haunted_woods.scene.placements.find(p => p.id === savedShopBuilding.id).legacyLocationId = legacyPages[0].id;
    // Existing room artwork covers the default merchandise position. The
    // selected shelf item must remain reachable, even with decor selected.
    const shopDecorId = "shop-decor-overlap";
    worlds.haunted_woods.scene.interiorItems.push({
      id: shopDecorId, worldId: "haunted_woods", buildingId: savedShopBuilding.id,
      kind: "decor", assetId: ids.decor, effectType: null, xPct: .5, yPct: .38, size: 220, flipped: false,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const linkedBuilding = page.getByTestId("world-scene-placement-" + savedShopBuilding.id);
    await linkedBuilding.waitFor({ state: "visible" });
    await linkedBuilding.focus();
    await linkedBuilding.press("Enter");
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    await page.getByTestId("world-edit-original-hotspot").waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Add Old World Page").count(), 0,
      name + ": linked buildings retain safe retirement without link editing");
    const restoreBuildingName = await editNameWithKeyboard(page.getByLabel("Rename world building"),
      "Enchanted Cottage Renamed", page.getByRole("button", { name: "Save Name" }));
    await Promise.all([
      page.waitForResponse(r => r.url().endsWith("/assets/" + savedShopBuilding.assetId) && r.request().method() === "PATCH"),
      page.getByRole("button", { name: "Save Name" }).click(),
    ]);
    await restoreBuildingName();
    assert.equal(worlds.haunted_woods.scene.placements.find(p => p.id === savedShopBuilding.id).legacyLocationId,
      legacyPages[0].id, name + ": unrelated edits do not remove an existing link");
    assert.ok(!apiWrites.some(w => w.method === "PATCH" && w.body && "legacyLocationId" in w.body));
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
    const shopDecor = page.getByTestId("world-interior-item-" + shopDecorId);
    await shopDecor.tap();
    await page.getByTestId("world-scene-selected-controls").waitFor();
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
    await merchandise.tap();
    await page.getByTestId("world-scene-selected-controls").waitFor({ state: "detached" });
    const preview = page.getByTestId("world-shop-price-preview");
    await preview.waitFor({ state: "visible" });
    // Only the merchandise controls should own the editor while selected.
    await page.getByTestId("world-scene-controls").waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("world-scene-controls").count(), 0,
      name + ": selecting merchandise hides overlapping World bottom controls");
    for (const label of ["Rotate merchandise clockwise 15 degrees", "Flip merchandise horizontally", "Larger merchandise"]) {
      const button = page.getByRole("button", { name: label });
      // Wait for the previous save before each separate toolbar gesture.
      await page.getByRole("status").filter({ hasText: "Saving shop…" }).waitFor({state: "detached"});
      await Promise.all([page.waitForResponse(r => r.url().includes("/placements/" + savedShopBuilding.id) &&
        r.request().method() === "PATCH" && r.request().postDataJSON().shopItemPlacements), button.tap()]);
    }
    await page.getByRole("status").filter({ hasText: "Saving shop…" }).waitFor({state: "detached"});
    const beforeTag = worlds.haunted_woods.scene.placements.find(p =>
      p.id === savedShopBuilding.id).shopItemPlacements[0];
    const marker = await page.getByTestId("world-shop-price-drag-handle").boundingBox();
    const artBox = await page.getByTestId("world-shop-price-preview-art").boundingBox();
    assert.ok(marker && artBox, name + ": preview and price-tag drag handle are visible");
    const tagSaved = page.waitForResponse(r => r.url().includes("/placements/" + savedShopBuilding.id) &&
      r.request().method() === "PATCH" && r.request().postDataJSON().shopItemPlacements);
    const shopTouch = await context.newCDPSession(page);
    const from = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
    const to = { x: artBox.x + artBox.width * .32, y: artBox.y + artBox.height * .3 };
    await shopTouch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
    for (const t of [.25, .5, .75, 1]) await shopTouch.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }],
    });
    await shopTouch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await shopTouch.detach();
    await tagSaved;
    const afterTag = worlds.haunted_woods.scene.placements.find(p =>
      p.id === savedShopBuilding.id).shopItemPlacements[0];
    assert.notDeepEqual([afterTag.priceTagXPct, afterTag.priceTagYPct],
      [beforeTag.priceTagXPct, beforeTag.priceTagYPct],
      name + ": dragging the preview tag persists image-local coordinates");
    const finalStock = worlds.haunted_woods.scene.placements.find(p =>
      p.id === savedShopBuilding.id).shopItemPlacements[0];
    assert.equal(finalStock.rotation, 15);
    assert.equal(finalStock.flippedX, true);
    assert.equal(finalStock.size, 14);
    await page.getByRole("button", { name: "Done editing item" }).click();
    await page.getByTestId("world-scene-controls").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Exit Room" }).click();
    await page.getByRole("button", { name: "Enter Building" }).click();
    await merchandise.waitFor({ state: "visible" });
    await merchandise.tap();
    await page.getByTestId("world-shop-price-preview").waitFor();
    assert.equal(await page.getByTestId("world-shop-rotation").textContent(), "15°");
    assert.equal(await page.getByTestId("world-shop-flip").getAttribute("aria-pressed"), "true");
    const restoredTag = await page.getByTestId("world-shop-price-drag-handle").evaluate(el =>
      [parseFloat(el.style.left) / 100, parseFloat(el.style.top) / 100]);
    assert.ok(Math.abs(restoredTag[0] - afterTag.priceTagXPct) < .001 &&
      Math.abs(restoredTag[1] - afterTag.priceTagYPct) < .001,
      name + ": reopening preserves the saved tag anchor");
    await page.getByRole("button", { name: "Done editing item" }).click();
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
    // The actual touch controls save exact angles per placement, wrap left
    // through 360, and draft rendering reflects each response immediately.
    const rotate = async (direction, angle) => {
      const label = direction === "reset" ? "Reset selected artwork rotation"
        : "Rotate selected artwork " + direction + " 5 degrees";
      const rotationButton = page.getByRole("button", { name: label });
      try { await rotationButton.tap(); }
      catch (error) {
        console.error("Rotation action failed", name, label, await rotationButton.evaluate(el=>({disabled:el.disabled,rect:el.getBoundingClientRect().toJSON(),style:getComputedStyle(el).pointerEvents})).catch(()=>null),
          await page.getByTestId("world-scene-selected-controls").innerText().catch(()=>null));
        await page.screenshot({path:"/tmp/para-rotation-editor-failure.png"}).catch(()=>{});
        throw error;
      }
      await page.waitForFunction(value => document.querySelector('[data-testid="world-scene-rotation-angle"]')?.textContent === value+"°",angle);
    };
    await rotate("left",355);
    await rotate("right",0);
    await rotate("right",5);
    assert.equal(worlds.haunted_woods.scene.placements.find(p=>p.id===firstDecor.id).rotation,5);
    const originalRotation = await page.getByTestId("world-scene-placement-"+firstDecor.id).evaluate(el=>el.style.transform);
    assert.match(originalRotation,/rotate\(5deg\)/);
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
    assert.equal(secondDecor.rotation,5,name+": duplicates preserve the saved rotation");
    await rotate("reset",0);
    assert.equal(worlds.haunted_woods.scene.placements.find(p=>p.id===firstDecor.id).rotation,5,
      name+": rotating one copy must not rotate another linked copy");
    assert.equal(secondDecor.decorSurface, "grass",
      name + ": copying a Grass decoration must inherit Grass automatically");
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    const decorNamePanel = page.getByTestId("world-decoration-name-editor");
    await decorNamePanel.waitFor({ state: "visible" });
    const decorName = decorNamePanel.getByLabel("Decoration Name");
    const saveDecorName = decorNamePanel.getByRole("button", { name: "Save Name" });
    assert.equal(await decorName.inputValue(), "Haunted Lantern", name + ": decor name starts with the saved asset name");
    assert.equal(await saveDecorName.isDisabled(), true);
    await decorName.fill("   ");
    assert.equal(await saveDecorName.isDisabled(), true, name + ": blank names cannot be saved");
    const restoreDecorName = await editNameWithKeyboard(decorName, "  Haunted Fishing Leaderboard  ", saveDecorName);
    const originalAsset = structuredClone(worlds.haunted_woods.scene.assets.find(a => a.id === firstDecor.assetId));
    const originalPlacements = structuredClone(worlds.haunted_woods.scene.placements);
    const otherWorld = structuredClone(worlds.swamp.scene);
    const [renamedResponse] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith("/assets/" + firstDecor.assetId) && r.request().method() === "PATCH"),
      saveDecorName.click(),
    ]);
    await restoreDecorName();
    assert.ok(renamedResponse.ok());
    assert.deepEqual(apiWrites.at(-1).body, { name: "Haunted Fishing Leaderboard" });
    await page.getByRole("heading", { name: "Edit Haunted Fishing Leaderboard" }).waitFor();
    assert.deepEqual(worlds.haunted_woods.scene.assets.find(a => a.id === firstDecor.assetId),
      { ...originalAsset, name: "Haunted Fishing Leaderboard" }, name + ": renaming changes only the asset name");
    assert.deepEqual(worlds.haunted_woods.scene.placements, originalPlacements,
      name + ": all linked copies preserve their IDs, position, size, behavior and effects");
    assert.deepEqual(worlds.swamp.scene, otherWorld, name + ": no other world is changed");
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    assert.equal(await decorName.inputValue(), "Haunted Fishing Leaderboard", name + ": reopening shows the saved name");
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
      circles.every(circle => !circle.style.mixBlendMode)),
      name + ": lamp masks no longer require CSS blending");
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
      return color === "black";
    }),
      name + ": scene brightness must be neutral, not yellow-brown");
    const alphaStops = await page.locator('[data-testid="world-editor-auto-day-night"] radialGradient[id$="-light-0"] stop')
      .evaluateAll(stops => stops.map(stop => Number(stop.getAttribute("stop-opacity"))));
    assert.ok(alphaStops[0] > 0.6 && alphaStops[0] < 0.7 &&
      alphaStops.at(-1) === 0 && alphaStops.every((opacity, i) => i === 0 || opacity <= alphaStops[i - 1]),
      name + ": neutral lamp alpha fades smoothly into night darkness");

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
    assert.ok(atWideZoom && atWideZoom.width<atNormalZoom.width*.75,
      name+": Fit offers a wider view without shrinking the world to a thumbnail");
    assert.ok(Number(await zoomSlider.inputValue())>=.6,
      name+": Fit respects the same safe minimum as Pet Park");
    const viewport=await page.getByTestId("world-scene-draft-viewport").boundingBox();
    const worldGroundBounds=await page.locator('[data-world-editor-artwork]').boundingBox();
    assert.ok(viewport && worldGroundBounds &&
      worldGroundBounds.x <= viewport.x + 1 && worldGroundBounds.y <= viewport.y + 1 &&
      worldGroundBounds.x + worldGroundBounds.width >= viewport.x + viewport.width - 1 &&
      worldGroundBounds.y + worldGroundBounds.height >= viewport.y + viewport.height - 1,
      name+": at minimum zoom, authored ground covers every phone/tablet viewport edge");
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

    await rotate("right",5);
    await rotate("right",10);
    const rotatedBox=await worldSprite.boundingBox();
    assert.match(await worldSprite.evaluate(el=>el.style.transform),/rotate\(10deg\)/);
    await page.getByRole("button",{name:"Deselect world object"}).tap();
    await page.touchscreen.tap(rotatedBox.x+rotatedBox.width/2,rotatedBox.y+rotatedBox.height/2);
    await page.getByTestId("world-scene-rotation-angle").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("world-scene-rotation-angle").textContent(),"10°");
    await rotate("reset",0);

    // Selecting artwork must leave almost all of the scene accessible for
    // touch dragging. Heavy preview/effects only render in the opt-in sheet.
    const movementBar = page.getByTestId("world-scene-selected-controls");
    const movementBox = await movementBar.boundingBox();
    assert.ok(movementBox && movementBox.height < height * .25,
      name + ": selected controls must not block the upper world canvas: " + JSON.stringify(movementBox));
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
    const cabin = page.getByTestId("world-scene-placement-" + ids.building);
    // After the preceding camera drags the cabin can sit behind the bottom
    // toolbar. Pan the scene as an admin would before clicking its artwork;
    // do not force a click through an overlay or move the saved placement.
    if (await cabin.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return !node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })) {
      const writesBefore = apiWrites.length;
      await page.mouse.move(26, height * .56);
      await page.mouse.down();
      await page.mouse.move(26, height * .30, { steps: 7 });
      await page.mouse.up();
      assert.equal(apiWrites.length, writesBefore, name + ": panning cabin out from behind controls does not save changes");
    }
    await cabin.click();
    await rotate("right",5);
    assert.match(await page.getByTestId("world-scene-placement-"+ids.building).evaluate(el=>el.style.transform),/rotate\(5deg\)/);
    const exteriorBeforeRoom = await page.getByTestId("world-scene-placement-" + ids.building).boundingBox();
    await page.getByRole("button", { name: "Enter Building" }).click();
    const darknessSlider = page.getByTestId("world-editor-interior-darkness-slider");
    await darknessSlider.waitFor({ state: "visible" });
    assert.equal(await darknessSlider.inputValue(), "35",
      name + ": existing world building has a 35% starting darkness");
    const room = page.getByTestId("world-editor-interior");
    {
      const roomViewport = page.getByTestId("world-scene-draft-viewport");
      // Actual wide room artwork must fill the height, not shrink into a strip.
      await room.locator("img").first().evaluate(img => img.decode());
      await page.waitForFunction(() => {
        const room = document.querySelector('[data-testid="world-editor-interior"]').getBoundingClientRect();
        const viewport = document.querySelector('[data-testid="world-scene-draft-viewport"]').getBoundingClientRect();
        return Math.abs(room.height - viewport.height) < 2 &&
          Math.abs(room.width / room.height - 16 / 9) < .01;
      });
      const fullRoom = await room.boundingBox();
      const visibleViewport = await roomViewport.boundingBox();
      const writesBeforePan = apiWrites.length;
      const beforePanItems = structuredClone(worlds.haunted_woods.scene.interiorItems);
      // Genuine touch input: drag background sideways, without altering items.
      const cdp = await context.newCDPSession(page);
      const swipeRoom = async (fromX, toX, fromY, toY = fromY) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y: fromY }] });
        for (let i = 1; i <= 6; i++)
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
            x: fromX + (toX - fromX) * i / 6, y: fromY + (toY - fromY) * i / 6,
          }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      assert.ok(Math.abs(fullRoom.y - visibleViewport.y) < 1, name + ": room starts at the viewport top");
      for (const mode of ["Fit room", "Full room", "Zoom room in", "Zoom room out"])
        assert.equal(await page.getByRole("button", { name: mode, exact: true }).count(), 0, name + ": no floating-picture controls");
      await swipeRoom(width * .75, width * .25, height * .28);
      assert.ok((await room.boundingBox()).x < fullRoom.x - 50, name + ": swiping the artwork pans the full-height room");
      assert.deepEqual(worlds.haunted_woods.scene.interiorItems, beforePanItems, name + ": panning changes no placement");
      assert.equal(apiWrites.length, writesBeforePan, name + ": pans do not save changes");
      const pannedBox = await room.boundingBox();
      assert.ok(Math.abs(pannedBox.y - fullRoom.y) < 1 && Math.abs(pannedBox.height - fullRoom.height) < 1);
      // Up/down and a wheel do not scroll, resize or detach the background.
      await swipeRoom(width * .85, width * .85, height * .58, height * .28);
      assert.deepEqual(await room.boundingBox(), pannedBox, name + ": vertical touch movement leaves the room fixed");
      await page.mouse.move(width * .85, height * .55);
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(100);
      assert.deepEqual(await room.boundingBox(), pannedBox, name + ": wheel cannot zoom the room");
      // Toolbars overlay the artwork. Hiding them exposes the floor without
      // changing the camera or the saved scene.
      await page.getByRole("button", { name: "Hide room tools" }).click();
      assert.equal(await darknessSlider.count(), 0);
      assert.deepEqual(await room.boundingBox(), pannedBox);
      await page.getByRole("button", { name: "Show room tools" }).click();
      await darknessSlider.waitFor();
      assert.deepEqual(await room.boundingBox(), pannedBox);
      assert.equal(apiWrites.length, writesBeforePan, name + ": camera and visibility changes do not save");
      const expectedX = (visibleViewport.x + visibleViewport.width / 2 - pannedBox.x) / pannedBox.width;
      await page.getByRole("button", { name: "+ Decor", exact: true }).click();
      await page.getByLabel("Scene item artwork").setInputFiles({
        name: "Interior Decor.png", mimeType: "image/png", buffer: png,
      });
      await page.getByAltText("New decoration preview").waitFor();
      const newInteriorSaved = page.waitForResponse(r => r.url().endsWith("/interior-items") && r.request().method() === "POST");
      await page.getByTestId("button-create-world-decoration").click();
      const newInterior = await (await newInteriorSaved).json();
      assert.equal(await roomViewport.evaluate(el => el.scrollLeft), 0,
        name + ": focus does not scroll the camera viewport");
      assert.ok(Math.abs(newInterior.xPct - expectedX) < .003,
        name + ": a new decoration appears in the panned region, not offscreen at the center of the full artwork: " +
          JSON.stringify({ actual: newInterior.xPct, expectedX, pannedBox, after: await room.boundingBox(), visibleViewport,
            scroll: await roomViewport.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop })) }));
      await page.getByTestId("world-interior-item-" + newInterior.id).waitFor();
      const newItemBox = await page.getByTestId("world-interior-item-" + newInterior.id).boundingBox();
      assert.ok(Math.abs(newItemBox.x + newItemBox.width / 2 - (visibleViewport.x + visibleViewport.width / 2)) < 2);
      await Promise.all([
        page.waitForResponse(r => r.url().endsWith("/interior-items/" + newInterior.id) && r.request().method() === "DELETE"),
        page.getByRole("button", { name: "Remove", exact: true }).click(),
      ]);
      await page.getByTestId("world-editor-interior-darkness-slider").waitFor();
      const writesBeforeCamera = apiWrites.length;
      // Return toward both real artwork edges with oversized mouse drags,
      // verify no blank margins, then restore the initial centered view.
      const dragRoom = async (fromX, toX) => {
        await page.mouse.move(fromX, height * .17);
        await page.mouse.down();
        await page.mouse.move(toX, height * .17, { steps: 6 });
        await page.mouse.up();
      };
      for (let i = 0; i < 8; i++) await dragRoom(width * .9, width * .1);
      const rightEdge = await room.boundingBox();
      assert.ok(Math.abs(rightEdge.x + rightEdge.width - visibleViewport.x - visibleViewport.width) < 2,
        name + ": repeated swipes stop at the right artwork edge");
      for (let i = 0; i < 8; i++) await dragRoom(width * .1, width * .9);
      const leftEdge = await room.boundingBox();
      assert.ok(Math.abs(leftEdge.x - visibleViewport.x) < 2,
        name + ": repeated swipes stop at the left artwork edge");
      assert.ok(Math.abs(leftEdge.y - fullRoom.y) < 1 && Math.abs(leftEdge.height - fullRoom.height) < 1);
      let remaining = leftEdge.x - fullRoom.x;
      while (remaining > 1) {
        const distance = Math.min(remaining, width * .6);
        await dragRoom(width * .85, width * .85 - distance);
        remaining -= distance;
      }
      assert.ok(Math.abs((await room.boundingBox()).x - fullRoom.x) < 2);
      assert.equal(apiWrites.length, writesBeforeCamera, name + ": camera never saves changes");
      // A selected object can still be dragged in both directions; hiding
      // tools makes the floor under the overlay accessible without vertical pan.
      const itemForDrag = page.getByTestId("world-interior-item-" + ids.room);
      const unselectedBox = await itemForDrag.boundingBox();
      const unselectedX = unselectedBox.x + unselectedBox.width / 2;
      const unselectedY = unselectedBox.y + unselectedBox.height / 2;
      const beforeSwipe = await room.boundingBox();
      await swipeRoom(unselectedX, unselectedX + width * .16, unselectedY);
      const afterSwipe = await room.boundingBox();
      assert.ok(afterSwipe.x > beforeSwipe.x + 20, name + ": swiping unselected artwork pans the background");
      assert.equal(await page.getByTestId("world-scene-selected-controls").count(), 0,
        name + ": swiping is not a tap or placement");
      assert.equal(apiWrites.length, writesBeforeCamera);
      await dragRoom(width * .85, width * .85 - (afterSwipe.x - beforeSwipe.x));
      await itemForDrag.tap();
      await page.getByTestId("world-scene-selected-controls").waitFor();
      await page.getByRole("button", { name: "Hide room tools" }).click();
      assert.equal(await page.getByTestId("world-scene-selected-controls").count(), 0);
      const itemBox = await itemForDrag.boundingBox();
      const roomBox = await room.boundingBox();
      const dx = width * .08, dy = roomBox.height * .36;
      const beforeMove = worlds.haunted_woods.scene.interiorItems.find(i => i.id === ids.room);
      const itemSaved = page.waitForResponse(r => r.url().endsWith("/interior-items/" + ids.room) && r.request().method() === "PATCH");
      await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(itemBox.x + itemBox.width / 2 + dx, itemBox.y + itemBox.height / 2 + dy, { steps: 5 });
      await page.mouse.up();
      await itemSaved;
      const afterMove = worlds.haunted_woods.scene.interiorItems.find(i => i.id === ids.room);
      assert.ok(Math.abs(afterMove.xPct - beforeMove.xPct - dx / roomBox.width) < .003);
      assert.ok(Math.abs(afterMove.yPct - beforeMove.yPct - dy / roomBox.height) < .003);
      assert.equal(apiWrites.filter(w => w.tail === "interior-items/" + ids.room).length, 1);
      assert.deepEqual(await room.boundingBox(), roomBox, name + ": moving decor does not move background");
      await page.getByRole("button", { name: "Show room tools" }).click();
      await page.getByRole("button", { name: "Deselect world object" }).click();
      await cdp.detach();
    }
    const interiorMask = room.getByTestId("home-interior-darkness-layer");
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
    // Leaving preserves both the exterior camera and building selection.
    // Re-enter via the already-visible movement toolbar, without a redundant
    // tap that could hit the toolbar if the building is behind it.
    assert.deepEqual(await page.getByTestId("world-scene-placement-" + ids.building).boundingBox(), exteriorBeforeRoom,
      name + ": interior pan never changes the outdoor camera");
    await page.getByRole("button", { name: "Enter Building" }).click();
    assert.equal(await page.getByTestId("world-editor-interior-darkness-slider").inputValue(), "90",
      name + ": reopening the building retains its saved darkness");
    // The same shared asset can also be named from an interior decoration.
    const roomItem = page.getByTestId("world-interior-item-" + ids.room);
    await roomItem.focus();
    await roomItem.press("Enter");
    const oldRoomItem = structuredClone(worlds.haunted_woods.scene.interiorItems.find(p=>p.id===ids.room));
    await rotate("left",355);
    assert.match(await roomItem.evaluate(el=>el.style.transform),/rotate\(355deg\)/);
    assert.deepEqual(worlds.haunted_woods.scene.interiorItems.find(p=>p.id===ids.room),{...oldRoomItem,rotation:355});
    await page.getByRole("button",{name:"Deselect world object"}).tap();
    await roomItem.focus();
    await roomItem.press("Enter");
    assert.equal(await page.getByTestId("world-scene-rotation-angle").textContent(),"355°");
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    const insideName = page.getByTestId("world-decoration-name-editor").getByLabel("Decoration Name");
    assert.equal(await insideName.inputValue(), worlds.haunted_woods.scene.assets.find(a => a.id === ids.decor).name);
    const beforeRoomItems = structuredClone(worlds.haunted_woods.scene.interiorItems);
    await insideName.fill("Room Lantern");
    await Promise.all([
      page.waitForResponse(r => r.url().endsWith("/assets/" + ids.decor) && r.request().method() === "PATCH"),
      page.getByTestId("world-decoration-name-editor").getByRole("button", { name: "Save Name" }).click(),
    ]);
    await page.getByRole("heading", { name: "Edit Room Lantern" }).waitFor();
    assert.deepEqual(worlds.haunted_woods.scene.interiorItems, beforeRoomItems, name + ": interior placement stays unchanged");
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "Deselect world object" }).click();
    // The interior uses the same picker and persisted orb color as outdoors.
    await page.getByRole("button", { name: "+ Effects", exact: true }).click();
    await page.getByTestId("world-standalone-light-color").fill("#7b5cff");
    const lampCreated = page.waitForResponse(r => r.url().endsWith("/interior-items") && r.request().method() === "POST");
    await page.getByTestId("add-world-effect-lamp_light").click();
    const newLamp = await (await lampCreated).json();
    assert.equal(newLamp.effectColor, "#7b5cff");
    assert.equal(newLamp.buildingId, ids.building);
    assert.equal(newLamp.effectType, "lamp_light");
    const core = page.getByTestId("world-interior-item-" + newLamp.id).getByTestId("home-lamp-light-core");
    await core.waitFor();
    assert.match(await core.evaluate(node => node.style.backgroundImage), /123,\s*92,\s*255/);
    await page.getByRole("button", { name: "Edit selected object details" }).click();
    const editColor = page.getByLabel("Edit world lamp light color");
    assert.equal(await editColor.inputValue(), "#7b5cff");
    const lampUpdated = page.waitForResponse(r => r.url().endsWith("/interior-items/" + newLamp.id) && r.request().method() === "PATCH");
    await editColor.fill("#44dd88");
    const updatedLamp = await (await lampUpdated).json();
    assert.deepEqual(updatedLamp, { ...newLamp, effectColor: "#44dd88" });
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.waitForFunction(id => /68,\s*221,\s*136/.test(document.querySelector(
      '[data-testid="world-interior-item-' + id + '"] [data-testid="home-lamp-light-core"]')?.style.backgroundImage ?? ""), newLamp.id);
    await page.getByRole("button", { name: "Exit Room" }).click();
    await page.getByRole("button", { name: "Enter Building" }).click();
    assert.match(await core.evaluate(node => node.style.backgroundImage), /68,\s*221,\s*136/,
      name + ": saved color survives reopening the room");
    const lampItem = page.getByTestId("world-interior-item-" + newLamp.id);
    await lampItem.focus();
    await lampItem.press("Enter");
    await Promise.all([
      page.waitForResponse(r => r.url().endsWith("/interior-items/" + newLamp.id) && r.request().method() === "DELETE"),
      page.getByRole("button", { name: "Remove", exact: true }).click(),
    ]);
    assert.deepEqual(worlds.haunted_woods.scene.interiorItems, beforeRoomItems,
      name + ": lamp color operations leave other room objects untouched");
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
    // Change the placed NPC's idle animation without changing its quest anchor.
    assert.equal(npcWrite.body.idleAnimation, "breath");
    const npcIdleSave = page.waitForResponse(r => r.url().endsWith("/placements/"+npcPlaced.id) && r.request().method()==="PATCH");
    await page.getByTestId("scene-idle-animation").selectOption("float");
    await npcIdleSave;
    assert.equal(worlds.haunted_woods.scene.placements.find(p=>p.id===npcPlaced.id).idleAnimation, "float");
    await page.getByRole("button", { name: "Deselect world object" }).click();
    await npcSprite.locator("img.scene-npc-float").waitFor({state:"visible"});

    // Add a Mini Pet using the real catalog picker and change this placement's
    // motion without rewriting its authored artwork or original catalog entry.
    await page.getByRole("button", {name:"+ Mini Pet"}).click();
    await page.getByRole("heading", {name:"Add Mini Pet"}).waitFor({state:"visible"});
    const createdMini = page.waitForResponse(r => r.url().endsWith("/placements") && r.request().method()==="POST");
    await page.getByTestId("button-place-mini-pet-"+savedMiniPet.shopItemId).click();
    const mini = await (await createdMini).json();
    assert.equal(mini.miniPetId,savedMiniPet.shopItemId);
    assert.equal(mini.idleAnimation,"breath");
    const miniSprite = page.getByTestId("world-scene-placement-"+mini.id);
    await miniSprite.getByTestId("scene-mini-pet").waitFor({state:"visible"});
    assert.equal(await miniSprite.locator('[data-mini-pet-part="closed_eyes"]').count(),1);
    const miniIdleSave = page.waitForResponse(r => r.url().endsWith("/placements/"+mini.id) && r.request().method()==="PATCH");
    await page.getByTestId("scene-idle-animation").selectOption("float");
    await miniIdleSave;
    await page.getByRole("button", {name:"Deselect world object"}).click();
    await miniSprite.locator(".scene-mini-pet-float").waitFor({state:"visible"});
    assert.equal(await miniSprite.locator(".scene-mini-pet-float").evaluate(el=>getComputedStyle(el).animationName),"sceneMiniPetFloat");
    assert.equal(await miniSprite.locator(".mini-pet-eyes-closed").evaluate(el=>getComputedStyle(el).animationName),"miniPetBlinkClosed");
    assert.equal(worlds.haunted_woods.scene.miniPets[0].animationStyle,"breath");
    assert.deepEqual(apiWrites.find(w=>w.tail==="placements/"+mini.id && w.body.idleAnimation==="float").body,{idleAnimation:"float"});

    // The new scene is always selected. Ground edits save without publishing,
    // even when buildings haven't been linked or opened yet.
    assert.ok(worlds.haunted_woods.scene.placements.some(p => p.kind === "building" && !p.legacyLocationId));
    await page.getByTestId("button-world-settings").click();
    assert.equal(await page.getByTestId("button-save-and-set-world-live").count(), 0);
    const publicationWrites = apiWrites.filter(w => w.tail === "publication").length;
    await page.getByTestId("select-world-draft-ground-theme").selectOption("haunted");
    const liveGroundSave = page.waitForResponse(r => r.url().endsWith("/draft") && r.request().method() === "PUT");
    await page.getByTestId("button-save-world-draft").click();
    await liveGroundSave;
    assert.equal(worlds.haunted_woods.draft.groundTheme, "haunted");
    assert.equal(apiWrites.filter(w => w.tail === "publication").length, publicationWrites,
      name + ": editing a scene requires no publishing");
    await page.getByRole("button", { name: "Close World Settings" }).click();

    // Crossing to another saved world cannot display or edit Haunted Woods assets.
    await page.goto("http://127.0.0.1:4194/fixture?world=swamp", { waitUntil: "commit" });
    await page.getByTestId("world-scene-editor").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "+ Decor" }).waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("world-scene-placement-" + ids.decor).count(), 0,
      name + ": Haunted Woods decoration placements are absent from the Bayou world");
    await page.getByRole("button", { name: "+ Decor" }).click();
    assert.equal(await page.getByText("Artwork Library").count(), 0,
      name + ": the same direct creation form works in every world");
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "+ NPC" }).click();
    const isolatedNpcSave=page.waitForResponse(r=>r.url().endsWith("/placements")&&r.request().method()==="POST");
    await page.getByTestId("button-place-world-npc-"+savedNpcs[0].id).click();
    const isolatedNpc=await (await isolatedNpcSave).json();
    const isolatedSprite=page.getByTestId("world-scene-placement-"+isolatedNpc.id);
    await isolatedSprite.waitFor({state:"visible"});
    await page.getByRole("button",{name:"Deselect world object"}).click();
    await isolatedSprite.locator("img.scene-npc-breath").waitFor({state:"visible"});
    const isolatedBounds=await isolatedSprite.boundingBox();
    await page.touchscreen.tap(isolatedBounds.x+isolatedBounds.width/2,isolatedBounds.y+isolatedBounds.height/2);
    await page.getByTestId("scene-idle-animation").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("scene-idle-animation").inputValue(),"breath");
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
