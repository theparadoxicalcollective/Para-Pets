import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  GARDEN_HARVEST_COUNTS, GARDEN_IMAGE_KEYS, GARDEN_PHASES,
  GARDEN_PICKED_COOLDOWN_MS, GARDEN_TOOL_OPTIONS, GARDEN_WATER_CAPACITY,
  GARDEN_PLANT_ANCHOR, gardenHarvestQuantity, gardenAfterWaterDrop, gardenEffectivePhase,
  isCompleteGardenCrop, validGardenArtwork, validGardenDrops, validGardenPrice,
} from "../shared/garden";
import { getGameItemCategory } from "../shared/itemTaxonomy";
import { isParkConnectedPath, isParkTerrainDetail, isPaintableParkTerrainDetail, parkTerrainHeightRatio, PARK_TERRAIN_DETAIL_OPTIONS } from "../shared/petParkTerrainDetails";
import { gardenCrops, shopItems } from "../shared/schema";
import { registerGardenAdminRoutes } from "../server/routes/gardenAdmin.routes";

const source = (path: string) => readFileSync(path, "utf8");

test("garden phase, watering, cooldown and harvest probabilities are defined once", () => {
  assert.equal(GARDEN_WATER_CAPACITY, 100);
  assert.equal(GARDEN_PICKED_COOLDOWN_MS, 30_000);
  assert.deepEqual(GARDEN_PHASES.map(phase => phase.key), ["planted", "seedling", "partial", "grown", "picked"]);
  assert.deepEqual(GARDEN_IMAGE_KEYS, ["seedPack", "planted", "seedling", "partial", "grown", "picked", "fruit"]);
  assert.deepEqual(GARDEN_HARVEST_COUNTS, [1, 2, 3]);
  assert.deepEqual(GARDEN_PLANT_ANCHOR, { x: .5, y: .5 });
  assert.equal(gardenHarvestQuantity(0), 1);
  assert.equal(gardenHarvestQuantity(.7499), 1);
  assert.equal(gardenHarvestQuantity(.75), 2);
  assert.equal(gardenHarvestQuantity(.9499), 2);
  assert.equal(gardenHarvestQuantity(.95), 3);
  assert.equal(gardenHarvestQuantity(.9999), 3);
  assert.throws(() => gardenHarvestQuantity(1));
  assert.throws(() => gardenHarvestQuantity(-1));
});

test("water only grows one phase per earned drop and never bypasses harvest readiness", () => {
  const required = { planted: 2, seedling: 1, partial: 3, grown: 2 };
  let state: { phase: "planted" | "seedling" | "partial" | "grown"; waterApplied: number; harvestReady: boolean } =
    { phase: "planted", waterApplied: 0, harvestReady: false };
  state = gardenAfterWaterDrop(state, required);
  assert.deepEqual(state, { phase: "planted", waterApplied: 1, harvestReady: false });
  state = gardenAfterWaterDrop(state, required);
  assert.deepEqual(state, { phase: "seedling", waterApplied: 0, harvestReady: false });
  state = gardenAfterWaterDrop(state, required);
  assert.deepEqual(state, { phase: "partial", waterApplied: 0, harvestReady: false });
  for(let i=0;i<3;i++) state = gardenAfterWaterDrop(state, required);
  assert.deepEqual(state, { phase: "grown", waterApplied: 0, harvestReady: false });
  state = gardenAfterWaterDrop(state, required);
  assert.deepEqual(state, { phase: "grown", waterApplied: 1, harvestReady: false });
  state = gardenAfterWaterDrop(state, required);
  assert.deepEqual(state, { phase: "grown", waterApplied: 2, harvestReady: true });
  assert.throws(() => gardenAfterWaterDrop(state, required));
  assert.throws(() => gardenAfterWaterDrop({ phase: "empty", waterApplied: 0, harvestReady: false }, required));
  const pickedAt = new Date("2026-11-06T00:00:00.000Z");
  assert.equal(gardenEffectivePhase("picked", new Date(pickedAt.getTime()+30_000), new Date(pickedAt.getTime()+29_999)), "picked");
  assert.equal(gardenEffectivePhase("picked", new Date(pickedAt.getTime()+30_000), new Date(pickedAt.getTime()+30_000)), "empty");
  assert.equal(gardenEffectivePhase("tilled", null, pickedAt), "tilled");
});

test("garden image, stages and water amounts reject malformed or dangerous payloads", () => {
  assert.equal(validGardenArtwork("data:image/png;base64,AA=="), true);
  assert.equal(validGardenArtwork("data:image/svg+xml;base64,AA=="), false);
  assert.equal(validGardenArtwork("https://example.com/seed.png"), false);
  assert.equal(validGardenArtwork("data:image/png;base64,"), false);
  assert.equal(validGardenDrops(1), true);
  assert.equal(validGardenDrops(1000), true);
  for (const bad of [0, -1, 1.5, 1001, "4", NaN]) assert.equal(validGardenDrops(bad), false);
  assert.equal(validGardenPrice(0), true);
  assert.equal(validGardenPrice(1_000_001), false);
  const images = Object.fromEntries(GARDEN_IMAGE_KEYS.map(key => [key, "/game/" + key + ".png"])) as
    Record<typeof GARDEN_IMAGE_KEYS[number], string | null>;
  assert.equal(isCompleteGardenCrop({ images, drops: [1, 2, 3, 4] }), true);
  assert.equal(isCompleteGardenCrop({ images: { ...images, picked: null }, drops: [1, 2, 3, 4] }), false);
  assert.equal(isCompleteGardenCrop({ images, drops: [0, 2, 3, 4] }), false);
  assert.equal(isCompleteGardenCrop({ images, drops: [1, 2, 3] }), false);
});

test("new Garden Plot paints with existing snapped isometric terrain system", () => {
  assert.equal(isPaintableParkTerrainDetail("garden_plot"), true);
  assert.equal(isParkTerrainDetail("garden_plot"), true);
  assert.equal(isParkConnectedPath("garden_plot"), false);
  assert.equal(parkTerrainHeightRatio("garden_plot"), .5);
  assert.equal(PARK_TERRAIN_DETAIL_OPTIONS.at(-1)?.type, "garden_plot");
  const brush = source("client/src/components/PetParkTerrainBrush.tsx");
  const art = source("client/src/components/PetParkTerrainDetail.tsx");
  assert.match(brush, /isParkConnectedPath\(type\) \|\| type === "garden_plot" \? parkExtendPathStroke/);
  assert.match(art, /type === "garden_plot"/);
  assert.match(art, /polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\)/);
  const page = source("client/src/pages/PetParkPage.tsx");
  assert.match(page, /isParkTerrainDetail\(item\.effectType\)/);
  assert.doesNotMatch(page, /DESIGN_W|DESIGN_H|390\s*[*×x]\s*844/);
});

test("garden models are additive, owner isolated and protect existing game economy", () => {
  const schema = source("shared/schema.ts");
  const migration = source("server/startup/migrations/ensureGardenStorage.ts");
  const boot = source("server/startup/migrations/runEssentialBoot.ts");
  assert.match(schema, /gardenCrops = pgTable\("garden_crops"/);
  assert.match(schema, /gardenPlayerPlots = pgTable\("garden_player_plots"/);
  assert.match(schema, /gardenWaterLeft: integer\("garden_water_left"\)/);
  assert.match(schema, /garden_player_plot_unique/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS garden_crops/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS garden_player_plots/);
  assert.match(migration, /CHECK \(garden_water_left IS NULL OR garden_water_left BETWEEN 0 AND 100\)/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(boot, /await ensurePetParkStorage\(\);\s*await ensureGardenStorage\(\);/);
  for (const type of ["garden_tool", "garden_seed", "garden_fruit"])
    assert.equal(getGameItemCategory({ type }), "garden");
  for (const name of ["Watering Pail", "Hoe", "Scythe"])
    assert.ok(GARDEN_TOOL_OPTIONS.some(tool => tool.label === name));
});

type ResponseStub = { code: number; body: any; status: (code: number) => ResponseStub; json: (body: any) => ResponseStub };
function setup() {
  const handlers: Record<string, any> = {};
  const gate = (() => {}) as any;
  const written: { table: unknown; body: Record<string, unknown> }[] = [];
  let uploaded = 0;
  const tx = { insert(table: unknown) {
    return { values(body: Record<string, unknown>) {
      written.push({ table, body });
      return { async returning() { return [{ id: "test-" + written.length, ...body }]; } };
    } };
  } };
  const db = { insert: tx.insert, async transaction(fn: (tx: typeof tx) => Promise<unknown>) {
    return fn(tx);
  } };
  const app = {
    get(path: string, ...list: any[]) { handlers["GET " + path] = list; },
    post(path: string, ...list: any[]) { handlers["POST " + path] = list; },
    patch(path: string, ...list: any[]) { handlers["PATCH " + path] = list; },
  };
  registerGardenAdminRoutes(app as any, {
    db: db as any, isAdmin: gate,
    processWorldImage: async () => "/game/processed-" + ++uploaded + ".png",
  });
  async function invoke(path: string, body: any) {
    const handlersForRoute = handlers[path];
    assert.ok(handlersForRoute, "garden route registered");
    assert.equal(handlersForRoute[0], gate, "every admin route must be protected");
    const response: ResponseStub = {
      code: 200, body: null,
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handlersForRoute.at(-1)({ body, params: { id: "crop-id" } }, response);
    return response;
  }
  return { invoke, written, handlers };
}

test("admin tool creation uses the normal shop catalog and enforces the 100-drop pail capacity", async () => {
  const h = setup();
  const invalid = await h.invoke("POST /api/admin/garden/tools", { kind: "watering_pail", name: "Pail", imageData: "https://unsafe" });
  assert.equal(invalid.code, 400);
  const created = await h.invoke("POST /api/admin/garden/tools", {
    kind: "watering_pail", name: "Forest Pail", price: 100, imageData: "data:image/png;base64,AA==",
  });
  assert.equal(created.code, 201);
  assert.equal(h.written[0].table, shopItems);
  assert.equal(h.written[0].body.type, "garden_tool");
  assert.equal(h.written[0].body.specialType, "watering_pail");
  assert.equal(h.written[0].body.specialAmount, 100);
  assert.equal(h.written[0].body.imageUrl, "/game/processed-1.png");
});

test("admin seed creation atomically creates a shop seed, fruit and crop definition", async () => {
  const h = setup();
  const payload = {
    name: "Magical Blueberry Seeds", fruitName: "Magical Blueberry",
    description: "A magical fruit crop", price: 50,
    seedPackImageData: "data:image/png;base64,AA==",
    fruitImageData: "data:image/png;base64,AA==",
    plantedImageData: "data:image/png;base64,AA==",
    plantedDrops: 3, seedlingDrops: 5, partialDrops: 8, grownDrops: 2,
  };
  const created = await h.invoke("POST /api/admin/garden/crops", payload);
  assert.equal(created.code, 201);
  assert.equal(h.written.length, 3);
  assert.deepEqual(h.written.map(w => w.table), [shopItems, shopItems, gardenCrops]);
  assert.equal(h.written[0].body.type, "garden_seed");
  assert.equal(h.written[1].body.type, "garden_fruit");
  assert.equal(h.written[1].body.worldId, "garden_harvest_only");
  const shopRoutes = source("server/routes.ts");
  assert.match(shopRoutes, /if \(shopItem\.type === "garden_fruit"\) \{\s*return res\.status\(403\)/);
  assert.equal(h.written[0].body.imageUrl, "/game/processed-1.png");
  assert.equal(h.written[1].body.imageUrl, "/game/processed-3.png");
  assert.equal(h.written[2].body.plantedDrops, 3);
  assert.equal(h.written[2].body.seedlingDrops, 5);
  assert.equal(h.written[2].body.partialDrops, 8);
  assert.equal(h.written[2].body.grownDrops, 2);
  const invalid = await h.invoke("POST /api/admin/garden/crops", { ...payload, plantedDrops: -1 });
  assert.equal(invalid.code, 400);
  assert.equal(h.written.length, 3, "invalid requests must never touch inventory/catalog tables");
});

test("Admin Realm provides stages and image upload controls without duplicating the Items editor", () => {
  const admin = source("client/src/pages/AdminPage.tsx");
  const panel = source("client/src/components/GardenAdminPanel.tsx");
  const routes = source("server/routes.ts");
  assert.match(admin, /key: "garden"\s+as const/);
  assert.match(admin, /activeSection === "garden" && <GardenAdminPanel/);
  assert.match(panel, /GARDEN_PHASES\.map\(phase/);
  assert.match(panel, /<ImageSlot label="seed pack \(shop & market\)"/);
  assert.match(panel, /<ImageSlot label="fruit \(bag & market\)"/);
  assert.match(panel, /Upload \$\{label\}/);
  assert.match(panel, /phase\.waterLabel/);
  assert.match(panel, /30 seconds/);
  assert.match(routes, /registerGardenAdminRoutes\(app, \{ db, isAdmin, processWorldImage \}\)/);
});
