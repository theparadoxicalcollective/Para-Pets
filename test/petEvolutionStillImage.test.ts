import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import ts from "typescript";
import { withPetStillImage } from "../shared/petStillImage";
import { insertShopItemSchema } from "../shared/schema";
import { processEvolutionImageUpdate } from "../server/evolutionImageUpload";

const species = Object.freeze({ type: "pet", imageUrl: "/egg.png", eggImageUrl: "/egg.png", hatchedImageUrl: "/hatched.png", evolutionImageUrl: "/evolved.png", petTemplateId: "animated-parts" });

test("only the confirmed evolved, hatched copy receives evolution still artwork", () => {
  const normal = withPetStillImage(species, { isHatched: true, isEvolved: false });
  const evolved = withPetStillImage(species, { isHatched: true, isEvolved: true });
  assert.equal(normal.hatchedImageUrl, "/hatched.png");
  assert.equal(evolved.hatchedImageUrl, "/evolved.png");
  assert.equal(evolved.eggImageUrl, "/egg.png");
  assert.equal(evolved.petTemplateId, "animated-parts");
  assert.equal(species.hatchedImageUrl, "/hatched.png", "catalog stays unchanged across owned copies");
  assert.equal(withPetStillImage(species, { isHatched: false, isEvolved: true }), species);
  assert.equal(withPetStillImage(species, { isHatched: true }), species);
  const completedTrack = { isHatched: true, completedSlots: 6, isComplete: true };
  assert.equal(withPetStillImage(species, completedTrack), species, "feed progress is not a confirmed evolution");
  const item = { ...species, type: "item" };
  assert.equal(withPetStillImage(item, { isHatched: true, isEvolved: true }), item);
});

test("missing or removed evolution artwork falls back to the usual pet artwork", () => {
  for (const evolutionImageUrl of [null, undefined, ""]) {
    const item = { ...species, evolutionImageUrl };
    assert.equal(withPetStillImage(item, { isHatched: true, isEvolved: true }).hatchedImageUrl, "/hatched.png");
    const legacy = { ...item, hatchedImageUrl: null };
    const resolved = withPetStillImage(legacy, { isHatched: true, isEvolved: true });
    assert.equal(resolved.hatchedImageUrl || resolved.imageUrl, "/egg.png");
  }
});

async function pngData() {
  const buffer = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 100, b: 200, alpha: 0 } } }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// Run the real shared media processor with an in-memory media store.
function imageProcessor() {
  const source = readFileSync("server/routes.ts", "utf8");
  const start = source.indexOf("  async function processWorldImage(");
  const end = source.indexOf("\n  registerCardAdminRoutes", start);
  const stored: { mime: string; data: string }[] = [];
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const process = runInNewContext(js + "\nprocessWorldImage", {
    sharp, Buffer,
    sql: (_strings: TemplateStringsArray, ...values: string[]) => values,
    db: { execute: async ([mime, data]: string[]) => { stored.push({ mime, data }); return { rows: [{ id: "evo-art" }] }; } },
  }) as (data: string, maxSize: number) => Promise<string>;
  return { stored, process: (data: string) => process(data, 2000) };
}

test("evolution uploads use the real media pipeline and preserve transparent still PNG artwork", async () => {
  const { stored, process } = imageProcessor();
  assert.equal(await processEvolutionImageUpdate({ evolutionImageData: await pngData() }, "pet", process), "/api/media/evo-art");
  assert.equal(stored[0].mime, "image/png");
  const metadata = await sharp(Buffer.from(stored[0].data, "base64")).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2);
  assert.equal(metadata.hasAlpha, true);
});

test("preserve and remove operations never create media", async () => {
  const fail = async () => { throw new Error("unexpected upload"); };
  assert.equal(await processEvolutionImageUpdate({}, "pet", fail), undefined);
  assert.equal(await processEvolutionImageUpdate({ evolutionImageUrl: null }, "pet", fail), null);
});

test("malformed, non-PNG, oversized, non-pet and direct URL inputs are rejected", async () => {
  const png = await pngData();
  const invalid: Array<{ input: Parameters<typeof processEvolutionImageUpdate>[0]; type: string }> = [
    { input: { evolutionImageData: 42 }, type: "pet" },
    { input: { evolutionImageData: null }, type: "pet" },
    { input: { evolutionImageData: "data:image/png;base64,bm90LXBuZw==" }, type: "pet" },
    { input: { evolutionImageData: "data:image/gif;base64,R0lGODlh" }, type: "pet" },
    { input: { evolutionImageData: "data:image/png;base64," + "A".repeat(28 * 1024 * 1024) }, type: "pet" },
    { input: { evolutionImageData: png }, type: "item" },
    { input: { evolutionImageUrl: "https://external.test/art.png" }, type: "pet" },
  ];
  let writes = 0;
  for (const { input, type } of invalid) {
    await assert.rejects(processEvolutionImageUpdate(input, type, async () => { writes++; return "bad"; }));
  }
  assert.equal(writes, 0);
  const { stored, process } = imageProcessor();
  await assert.rejects(processEvolutionImageUpdate({ evolutionImageData: "data:image/png;base64,iVBORw0KGgo=" }, "pet", process));
  assert.equal(stored.length, 0, "corrupt PNG must not be stored");
});

function adminHandler(method: "post" | "patch") {
  const path = method === "post" ? "/api/admin/shop" : "/api/admin/shop/:itemId";
  const source = readFileSync("server/routes.ts", "utf8");
  const start = source.indexOf(`  app.${method}("${path}"`);
  const end = source.indexOf("\n  app.", start + 1);
  const existing = { id: "pet-item", name: "Test pet", price: 0, worldId: "all", ...species };
  const writes: any[] = [];
  let route!: (req: any, res: any) => Promise<unknown>;
  const isAdmin = () => {};
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, {
    app: { [method]: (_path: string, auth: unknown, fn: typeof route) => { assert.equal(auth, isAdmin, "upload remains admin-only"); route = fn; } },
    isAdmin, insertShopItemSchema, processEvolutionImageUpdate,
    processShopItemImage: async () => "/api/media/new-evo",
    console: { error: () => {} },
    storage: {
      getShopItem: async () => existing,
      createShopItem: async (data: any) => { writes.push(data); return data; },
      updateShopItem: async (_id: string, data: any) => { writes.push(data); return { ...existing, ...data }; },
    },
  });
  return { writes, async request(body: any) {
    const result = { status: 200, body: undefined as any };
    const response = { status(code: number) { result.status = code; return response; }, json(data: any) { result.body = data; return response; } };
    await route({ params: { itemId: "pet-item" }, body }, response);
    return result;
  } };
}

test("admin create and edit persist processed evolution URLs", async () => {
  for (const method of ["post", "patch"] as const) {
    const handler = adminHandler(method);
    const result = await handler.request({ name: "Pet", type: "pet", worldId: "all", price: 0, evolutionImageData: await pngData() });
    assert.equal(result.status, method === "post" ? 201 : 200);
    assert.equal(result.body.evolutionImageUrl, "/api/media/new-evo");
    assert.equal(handler.writes[0].evolutionImageData, undefined);
  }
});

test("admin edits preserve, remove, and replace evolution artwork without touching base art", async () => {
  const handler = adminHandler("patch");
  assert.equal((await handler.request({ name: "Renamed" })).body.evolutionImageUrl, "/evolved.png");
  assert.equal(Object.hasOwn(handler.writes[0], "evolutionImageUrl"), false);
  const removed = await handler.request({ evolutionImageUrl: null });
  assert.equal(removed.body.evolutionImageUrl, null);
  assert.equal(removed.body.hatchedImageUrl, "/hatched.png");
  const invalid = await handler.request({ evolutionImageData: false });
  assert.equal(invalid.status, 400);
  assert.equal(handler.writes.length, 2, "invalid upload must not update the saved pet");
});
