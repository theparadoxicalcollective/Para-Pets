import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { petParkSceneItems } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";

function setup(initial: any = { id: "gate", kind: "decor", imageUrl: "/closed.webp", tapImageUrl: null }) {
  const routes = new Map<string, Function[]>();
  const writes: { operation: string; values: any }[] = [];
  const processed: string[] = [];
  const guard = (_req: unknown, _res: unknown, next: Function) => next();
  const app: Record<string, Function> = {};
  for (const method of ["get", "post", "patch", "delete", "put"]) {
    app[method] = (url: string, ...handlers: Function[]) =>
      routes.set(method.toUpperCase() + " " + url, handlers);
  }
  const db = {
    select() { return { from(table: unknown) {
      assert.equal(table, petParkSceneItems);
      return { async where() { return initial ? [initial] : []; } };
    } }; },
    insert(table: unknown) { assert.equal(table, petParkSceneItems); return {
      values(values: any) { writes.push({ operation: "insert", values }); return {
        async returning() { return [{ id: "new-gate", ...values }]; },
      }; },
    }; },
    update(table: unknown) { assert.equal(table, petParkSceneItems); return {
      set(values: any) { return { where() { return {
        async returning() { writes.push({ operation: "update", values }); return [{ ...initial, ...values }]; },
      }; } }; },
    }; },
  };
  registerPetParkAdminRoutes(app as any, {
    db: db as any, isAdmin: guard as any,
    processWorldImage: async (data: string, max: number) => {
      assert.equal(max, 1200, "Tap Images use the same optimized Pet Park image pipeline");
      processed.push(data);
      return "/assets/tap-image-" + processed.length + ".webp";
    },
  });
  const call = async (method: string, endpoint: string, body: any, id = "gate") => {
    const handlers = routes.get(method + " " + endpoint);
    assert.ok(handlers, method + " " + endpoint);
    assert.equal(handlers[0], guard, "only an administrator can write Tap Image assets");
    const reply = { code: 200, body: null as any,
      status(code: number) { this.code = code; return this; },
      json(body: any) { this.body = body; return this; } };
    await handlers.at(-1)!({ params: { id }, body }, reply);
    return reply;
  };
  const good = { kind: "decor", imageData: "data:image/png;base64,AAAA", xPct: .4,
    yPct: .6, size: 160, flipped: false, layer: 0, isWaterSource: false };
  return { call, writes, processed, good };
}

test("new Pet Park decoration may optionally include a processed alternate image", async () => {
  const s = setup();
  const single = await s.call("POST", "/api/admin/pet-park/items", s.good);
  assert.equal(single.code, 201);
  assert.equal(s.writes[0].values.tapImageUrl, null, "ordinary decor defaults to its original art");
  assert.equal(s.processed.length, 1);
  const both = await s.call("POST", "/api/admin/pet-park/items",
    { ...s.good, tapImageData: "data:image/png;base64,BBBB" });
  assert.equal(both.code, 201);
  assert.equal(s.writes[1].values.imageUrl, "/assets/tap-image-2.webp");
  assert.equal(s.writes[1].values.tapImageUrl, "/assets/tap-image-3.webp");
  assert.equal(s.writes[1].values.xPct, .4);
  assert.equal(s.writes[1].values.yPct, .6);
  assert.equal(s.writes[1].values.size, 160);
  for (const body of [
    { ...s.good, kind: "effect", effectType: "waterfall_mist", tapImageData: "data:image/png;base64,AAAA" },
    { ...s.good, kind: "terrain", tapImageData: "data:image/png;base64,AAAA" },
    { ...s.good, tapImageData: "not-an-image" },
    { ...s.good, tapImageData: "data:image/png;base64," + "A".repeat(8_000_001) },
  ]) {
    assert.equal((await s.call("POST", "/api/admin/pet-park/items", body)).code, 400);
  }
  assert.equal(s.writes.length, 2, "invalid Tap Image uploads never create records");
});

test("existing decor can replace/clear tap artwork without affecting main image or water source", async () => {
  const s = setup({ id: "gate", kind: "decor", imageUrl: "/closed.webp",
    tapImageUrl: "/open.webp", isWaterSource: true, xPct: .75, yPct: .34 });
  const endpoint = "/api/admin/pet-park/items/:id/tap-image";
  assert.equal((await s.call("PATCH", endpoint, {})).code, 400);
  assert.equal((await s.call("PATCH", endpoint, { imageData: "plain-text" })).code, 400);
  assert.equal(s.processed.length, 0);
  const updated = await s.call("PATCH", endpoint, { imageData: "data:image/png;base64,AAAA" });
  assert.equal(updated.code, 200);
  assert.equal(updated.body.tapImageUrl, "/assets/tap-image-1.webp");
  assert.deepEqual(s.writes[0].values, { tapImageUrl: "/assets/tap-image-1.webp" },
    "editing Tap Image leaves placement, base art and water-source status untouched");
  const removed = await s.call("PATCH", endpoint, { imageData: null });
  assert.equal(removed.code, 200);
  assert.deepEqual(s.writes[1].values, { tapImageUrl: null });
  assert.equal(s.processed.length, 1, "removing Tap Image skips uploads");

  assert.equal((await setup(null).call("PATCH", endpoint, { imageData: null })).code, 404);
  assert.equal((await setup({ id: "road", kind: "terrain" }).call("PATCH", endpoint,
    { imageData: "data:image/png;base64,AAAA" })).code, 404);
});

test("tap art is additive and player visuals reuse scene's shared image hit testing", () => {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
  const admin = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
  const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const api = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  assert.match(schema, /tapImageUrl: text\("tap_image_url"\)/);
  assert.match(migration, /ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS tap_image_url text/);
  assert.match(admin, /aria-label="Decoration Tap Image"/);
  assert.match(admin, /tapImageData: pendingTapImage/);
  assert.match(park, /data-testid="park-decoration-tap-image-editor"/);
  assert.match(park, /items\/\$\{id\}\/tap-image/);
  assert.match(park, /data-testid="pet-park-tappable-decor"/);
  assert.match(park, /tappedDecorIds\.has\(item\.id\)/);
  assert.match(park, /parkImageHitAt\(image, event\.clientX, event\.clientY, item\.flipped\)/);
  assert.match(api, /tapImageUrl: original\.tapImageUrl/);
  assert.match(park, /setSelectedWaterSourceId\(item\.id\)/);
  assert.match(park, /setSelectedGardenPlotId\(item\.id\)/);
  assert.doesNotMatch(park, /DESIGN_W|DESIGN_H|390\s*[x×]\s*844/);
});
