import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_GARDEN_STAGE_PLACEMENT, GARDEN_PHASES,
  validGardenStagePlacement, type GardenStagePlacement,
} from "../shared/garden";
import { gardenCrops } from "../shared/schema";
import { registerGardenAdminRoutes } from "../server/routes/gardenAdmin.routes";

const read = (file: string) => readFileSync(file, "utf8");

test("shared stage placement contract has bounded, finite and independent coordinates", () => {
  assert.deepEqual(DEFAULT_GARDEN_STAGE_PLACEMENT, { x: 0, y: 0, scale: .55 });
  assert.deepEqual(GARDEN_PHASES.map(phase => phase.key),
    ["planted", "seedling", "partial", "grown", "picked"]);
  for (const valid of [
    { x: 0, y: 0, scale: .55 },
    { x: -.34, y: .27, scale: .15 },
    { x: 1.25, y: -1.25, scale: 1.5 },
  ]) assert.equal(validGardenStagePlacement(valid), true);
  for (const invalid of [
    null, {}, { x: 0, y: 0 }, { x: 0, y: 0, scale: 0 },
    { x: 0, y: 0, scale: 1.51 }, { x: 1.26, y: 0, scale: .55 },
    { x: Infinity, y: 0, scale: .55 }, { x: NaN, y: 0, scale: .55 },
    { x: "0", y: 0, scale: .55 }, { x: 0, y: 0, scale: .55, extra: 99 },
  ]) assert.equal(validGardenStagePlacement(invalid), false, JSON.stringify(invalid));
});

test("stage layouts persist additively and are part of player crop catalog", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensureGardenStorage.ts");
  const player = read("server/routes/gardenPlayer.routes.ts");
  assert.match(schema, /stagePlacements: jsonb\("stage_placements"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS stage_placements jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(player, /stagePlacements: crop\.stagePlacements \?\? \{\}/);
  assert.match(player, /id: crop\.id, seedItemId: crop\.seedItemId/);
});

test("admin placement endpoint rejects invalid uploads, edits and unknown crop IDs", async () => {
  const gate = (() => {}) as any;
  const handlers = new Map<string, any[]>();
  let crop: any = {
    id: "crop1", seedItemId: "seed", plantedImageUrl: "/game/planted.png",
    seedlingImageUrl: "/game/sprout.png", partialImageUrl: null, grownImageUrl: null,
    pickedImageUrl: "/game/picked.png", stagePlacements: {},
  };
  let updates = 0;
  const tx = {
    select() { return { from(table: unknown) {
      assert.equal(table, gardenCrops);
      return { where() { return { async for(lock: string) {
        assert.equal(lock,"update");
        return crop ? [crop] : [];
      } }; } };
    } }; },
    update(table: unknown) {
      assert.equal(table, gardenCrops);
      return { set(change: Record<string, any>) {
        return { where() { return { async returning() {
          crop = { ...crop, ...change };
          updates++;
          return [crop];
        } }; } };
      } };
    },
  };
  const app = {
    get(path: string, ...callbacks: any[]) { handlers.set("GET " + path, callbacks); },
    patch(path: string, ...callbacks: any[]) { handlers.set("PATCH " + path, callbacks); },
    post(path: string, ...callbacks: any[]) { handlers.set("POST " + path, callbacks); },
  };
  registerGardenAdminRoutes(app as any, {
    db: { transaction: async (callback: any) => callback(tx) } as any,
    isAdmin: gate,
    processWorldImage: async () => "/game/processed.png",
  });
  const handler = handlers.get("PATCH /api/admin/garden/crops/:id/stage-placement");
  assert.ok(handler, "the authenticated endpoint is registered");
  assert.equal(handler![0], gate, "only admin users may change crop placement");
  const invoke = async (body: object) => {
    const res: any = { code: 200, data: null,
      status(code: number) { this.code = code; return this; },
      json(data: unknown) { this.data = data; return this; } };
    await handler!.at(-1)({ params: { id: "crop1" }, body }, res);
    return res;
  };
  for (const bad of [
    { stage: "fruit", placement: DEFAULT_GARDEN_STAGE_PLACEMENT },
    { stage: "planted", placement: { x: -10, y: 0, scale: .5 } },
    { stage: "planted", placement: { x: 0, y: 0, scale: 500 } },
    { stage: "planted", placement: DEFAULT_GARDEN_STAGE_PLACEMENT, cropId: "other" },
  ]) assert.equal((await invoke(bad)).code, 400);
  assert.equal((await invoke({ stage: "partial", placement: DEFAULT_GARDEN_STAGE_PLACEMENT })).code, 422,
    "a stage needs uploaded artwork before admin can save its position");
  assert.equal(updates, 0, "invalid actions never write");

  const planted: GardenStagePlacement = { x: -.25, y: .1, scale: .35 };
  const saved = await invoke({ stage: "planted", placement: planted });
  assert.equal(saved.code, 200);
  assert.deepEqual(saved.data.stagePlacements, { planted });
  assert.equal(updates, 1);
  const seedling: GardenStagePlacement = { x: .18, y: -.08, scale: .6 };
  const second = await invoke({ stage: "seedling", placement: seedling });
  assert.equal(second.code, 200);
  assert.deepEqual(second.data.stagePlacements, { planted, seedling },
    "saving one stage does not overwrite another stage");
  crop = null;
  assert.equal((await invoke({ stage: "planted", placement: planted })).code, 404);
  assert.equal(updates, 2);
});

test("dedicated editor uses the exact Pet Park renderer and saves one stage below its plot", () => {
  const page = read("client/src/components/GardenAdminPanel.tsx");
  const editor = read("client/src/components/GardenStagePlacementEditor.tsx");
  const artwork = read("client/src/components/PetParkCropArtwork.tsx");
  const park = read("client/src/pages/PetParkPage.tsx");
  const routes = read("server/routes/gardenAdmin.routes.ts");
  assert.match(page, /data-testid="garden-adjust-plants-on-plot"/);
  assert.match(page, /<GardenStagePlacementEditor crops=\{data\?\.crops \?\? \[\]\}/);
  assert.match(editor, /GARDEN_PHASES\.flatMap\(phase/);
  assert.match(editor, /crop\[\(phase\.key \+ "ImageUrl"\)/);
  assert.match(editor, /role="listbox" aria-label="Uploaded garden stages"/);
  assert.match(editor, /data-testid="garden-stage-choice"/);
  assert.match(editor, /stagePlacements\?\.\[choice\.stage\]/);
  assert.match(editor, /data-testid="garden-stage-plot-preview"/);
  assert.match(editor, /<PetParkTerrainDetail type="garden_plot" tilled/);
  assert.match(editor, /<PetParkCropArtwork key=\{selected\.key/);
  assert.match(park, /<PetParkCropArtwork key=\{plot\.plotItemId/);
  assert.match(park, /placement=\{crop\?\.stagePlacements\?\.\[plot\.phase/);
  assert.match(editor, /setPointerCapture\(event\.pointerId\)/);
  assert.match(editor, /onPointerMove=\{event =>/);
  assert.match(editor, /data-testid="garden-stage-size-slider"/);
  assert.match(editor, /data-testid="garden-save-stage-placement"/);
  assert.match(editor, /className="text-xl text-\[#71de85\]">●/);
  assert.match(artwork, /position\.x \* plotWidth/);
  assert.match(artwork, /position\.y \* plotWidth/);
  assert.match(artwork, /plotWidth \* position\.scale/);
  assert.match(routes, /delete preservedPlacements\[stage\]/);
});
