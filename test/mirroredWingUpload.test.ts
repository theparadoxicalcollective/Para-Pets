import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";
import { applyCostumeWingUpload, CostumeWingUploadError } from "../server/costumeWingUpload";
import { normalizeCostumePlacements, type CostumePlacement } from "../shared/costumeFeature";
import { costumePlacementsSchema, petCostumeDefinitions } from "../shared/costumeSchema";

const url = "/api/media/12345678-1234-4123-8123-123456789abc";
const oldUrl = "/api/media/87654321-1234-4123-8123-123456789abc";
const fitting: CostumePlacement = { view: "front", instance: 2, anchorPart: "independent", animation: "wings", posX: 500, posY: 500, width: 200, height: 100, pivotX: 10, pivotY: 75, depth: "front" };

async function pngData() {
  const buffer = await sharp({ create: { width: 3000, height: 30, channels: 4, background: { r: 100, g: 80, b: 200, alpha: 0.5 } } }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function mediaProcessor() {
  const source = readFileSync("server/routes.ts", "utf8");
  const start = source.indexOf("  async function processWorldImage(");
  const end = source.indexOf("\n  registerCardAdminRoutes", start);
  const stored: { mime: string; data: string }[] = [];
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const process = runInNewContext(js + "\nprocessWorldImage", {
    sharp, Buffer,
    sql: (_strings: TemplateStringsArray, ...values: string[]) => values,
    db: { execute: async ([mime, data]: string[]) => { stored.push({ mime, data }); return { rows: [{ id: url.split("/").pop() }] }; } },
  }) as (data: string, maxSize: number) => Promise<string>;
  return { stored, process: (data: string) => process(data, 2000) };
}

/** Exercise the actual admin handler without a live database or auth session. */
function adminHandler(processImage: (data: string) => Promise<string>) {
  const source = readFileSync("server/routes/costumeAdmin.routes.ts", "utf8");
  const js = ts.transpileModule(source.slice(source.indexOf("export function registerCostumeAdminRoutes")).replace("export function", "function"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const writes: any[] = [];
  let route!: (req: any, res: any) => Promise<unknown>;
  const requireAdmin = () => {};
  runInNewContext(js + "\nregisterCostumeAdminRoutes(app, processImage)", {
    app: { get: () => {}, put: (_path: string, auth: unknown, fn: typeof route) => { assert.equal(auth, requireAdmin); route = fn; } },
    requireAdmin, processImage, applyCostumeWingUpload, CostumeWingUploadError, costumePlacementsSchema, petCostumeDefinitions,
    console: { error: () => {} },
    db: { insert: () => ({ values: (data: any) => ({ onConflictDoUpdate: () => ({ returning: async () => { writes.push(data); return [data]; } }) }) }) },
  });
  return { writes, async request(body: any) {
    const result = { status: 200, body: undefined as any };
    const response = { status(code: number) { result.status = code; return response; }, json(data: any) { result.body = data; return response; } };
    await route({ body: { shopItemId: "costume", templateId: "pet", ...body } }, response);
    return result;
  } };
}

test("wing upload saves a bounded transparent PNG only on its selected view and copy", async () => {
  const { stored, process } = mediaProcessor();
  const handler = adminHandler(process);
  const placements = [fitting, { ...fitting, instance: 1, mirroredWingImageUrl: oldUrl }, { ...fitting, view: "side", mirroredWingImageUrl: oldUrl }];
  const result = await handler.request({ placements, mirroredWingUpload: { view: "front", instance: 2, imageData: await pngData() } });
  assert.equal(result.status, 200);
  const restored = normalizeCostumePlacements(JSON.parse(JSON.stringify(result.body.placements)));
  assert.deepEqual(restored.map(p => p.mirroredWingImageUrl), [url, oldUrl, oldUrl]);
  assert.equal(placements[0].mirroredWingImageUrl, undefined, "input is not mutated");
  assert.doesNotMatch(JSON.stringify(handler.writes), /data:image|imageData/);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].mime, "image/png");
  const metadata = await sharp(Buffer.from(stored[0].data, "base64")).metadata();
  assert.equal(metadata.width, 2000);
  assert.equal(metadata.height, 20);
  assert.equal(metadata.hasAlpha, true);
});

test("wing replacement, removal and unrelated edits round-trip through the save route", async () => {
  let uploads = 0;
  const handler = adminHandler(async () => { uploads++; return url; });
  const saved = { ...fitting, mirroredWingImageUrl: oldUrl };
  const moved = await handler.request({ placements: [{ ...saved, posX: 700, animation: "float" }] });
  assert.equal(moved.body.placements[0].mirroredWingImageUrl, oldUrl);
  const replaced = await handler.request({ placements: [saved], mirroredWingUpload: { view: "front", instance: 2, imageData: await pngData() } });
  assert.equal(replaced.body.placements[0].mirroredWingImageUrl, url);
  const removed = await handler.request({ placements: [{ ...saved, mirroredWingImageUrl: undefined }] });
  assert.equal(removed.body.placements[0].mirroredWingImageUrl, undefined);
  assert.equal(uploads, 1);
});

test("invalid wing uploads never write a costume definition or media", async () => {
  const { stored, process } = mediaProcessor();
  const handler = adminHandler(process);
  const upload = { view: "front", instance: 2, imageData: await pngData() };
  const invalid = [
    { mirroredWingUpload: null },
    { mirroredWingUpload: { ...upload, view: "side" } },
    { mirroredWingUpload: { ...upload, instance: 5 } },
    { placements: [{ ...fitting, anchorPart: "body" }], mirroredWingUpload: upload },
    ...[42, "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,bm90LXBuZw==", "data:image/png;base64,iVBORw0KGgo=", "data:image/png;base64," + "A".repeat(28 * 1024 * 1024)]
      .map(imageData => ({ mirroredWingUpload: { ...upload, imageData } })),
    ...["https://example.com/wing.png", "//example.com/image", "javascript:alert(1)", upload.imageData, "/api/media/../admin"]
      .map(mirroredWingImageUrl => ({ placements: [{ ...fitting, mirroredWingImageUrl }] })),
  ];
  for (const input of invalid) assert.equal((await handler.request({ placements: [fitting], ...input })).status, 400);
  assert.equal(handler.writes.length, 0);
  assert.equal(stored.length, 0);
});

test("processing failure preserves the saved fitting and hides internal error details", async () => {
  const handler = adminHandler(async () => { throw new Error("private database details"); });
  const result = await handler.request({ placements: [fitting], mirroredWingUpload: { view: "front", instance: 2, imageData: await pngData() } });
  assert.equal(result.status, 400);
  assert.doesNotMatch(result.body.message, /private database/);
  assert.equal(handler.writes.length, 0);
});

test("custom opposite wing keeps orientation and synchronized motion; removal restores automatic mirroring", async () => {
  const result = await build({ entryPoints: ["client/src/components/AdornmentArtwork.tsx"], bundle: true, platform: "node", format: "cjs", packages: "external", write: false, jsx: "automatic" });
  const module = { exports: {} as { default: any } };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const render = (placement: CostumePlacement, animated = true) => renderToStaticMarkup(createElement(module.exports.default, { src: "/first.png", placement, animated }));
  const custom = { ...fitting, mirroredWingImageUrl: url };
  const markup = render(custom);
  assert.equal((markup.match(/<img /g) ?? []).length, 2);
  assert.equal((markup.match(/adornment-wings 1.8s/g) ?? []).length, 2);
  assert.match(markup, /transform-origin:10% 75%/);
  assert.match(markup, /<img[^>]+src="\/api\/media\/[^>]+transform:scaleX\(-1\);transform-origin:50% 50%/);
  const automatic = render({ ...custom, mirroredWingImageUrl: undefined });
  assert.equal((automatic.match(/src="\/first.png"/g) ?? []).length, 2);
  assert.equal((automatic.match(/scaleX\(-1\)/g) ?? []).length, 1);
  assert.doesNotMatch(render(custom, false), /animation:/);
  for (const placement of [{ ...custom, animation: "float" as const }, { ...custom, anchorPart: "left_wing" }]) {
    assert.equal((render(placement).match(/<img /g) ?? []).length, 1);
    assert.doesNotMatch(render(placement), /src="\/api\/media\//);
  }
});
