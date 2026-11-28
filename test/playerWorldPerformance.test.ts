import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { WORLD_ARTWORK_SIZES, worldArtworkSize, worldArtworkUrl } from "../shared/worlds/worldArtworkSize";
import { playerWorldArtworkVisibility, playerWorldSceneQuery } from "../client/src/lib/playerWorldScene";
import { createWorldArtworkService, encodeWorldArtwork, WorldArtworkBusyError } from "../server/routes/worldArtworkMedia.routes";

const id = "12345678-1234-1234-1234-123456789abc";
const url = `/api/media/${id}`;
test("world artwork buckets match rendered physical pixels and only transform stored media", () => {
  assert.deepEqual(WORLD_ARTWORK_SIZES, [256, 512, 768, 1024, 1536, 2048, 2400]);
  assert.equal(worldArtworkSize(110, 3), 512);
  assert.equal(worldArtworkSize(300, 2), 768);
  assert.equal(worldArtworkSize(10000, 10), 2400);
  assert.equal(worldArtworkSize(NaN, NaN), 256);
  assert.equal(worldArtworkUrl(url, 300, 2), `${url}/world-v1/768`);
  for (const other of ["/assets/scene.png", "data:image/png;base64,hello", "https://example.org/art.png", "/api/media/invalid", `${url}?foo=1`])
    assert.equal(worldArtworkUrl(other, 300, 2), other);
});

test("world viewport culls distant art while keeping adjacent art eligible for preloading", () => {
  const viewport = { width: 390, height: 844 };
  assert.deepEqual(playerWorldArtworkVisibility(200, 200, 100, 100, viewport), { visible: true, nearby: true });
  assert.deepEqual(playerWorldArtworkVisibility(450, 200, 100, 100, viewport), { visible: false, nearby: true });
  assert.deepEqual(playerWorldArtworkVisibility(700, 200, 100, 100, viewport), { visible: false, nearby: false });
  assert.deepEqual(playerWorldArtworkVisibility(-40, 200, 100, 100, viewport), { visible: true, nearby: true });
  assert.deepEqual(playerWorldArtworkVisibility(200, -250, 100, 400, viewport), { visible: false, nearby: true });
});

test("the original PNG stays untouched, transparent art gets a much smaller proportional copy", async () => {
  const pixels = Buffer.alloc(1200 * 600 * 4);
  for (let y = 0; y < 600; y++) for (let x = 0; x < 1200; x++) {
    const i = (y * 1200 + x) * 4;
    pixels[i] = x % 256; pixels[i+1] = y % 256; pixels[i+2] = (x * y) % 256;
    pixels[i+3] = x < 300 ? 0 : x < 600 ? 128 : 255;
  }
  const bytes = await sharp(pixels, { raw: { width: 1200, height: 600, channels: 4 } }).png().toBuffer();
  const copy = Buffer.from(bytes);
  const variant = await encodeWorldArtwork({ mime: "image/png", bytes }, 512);
  assert.equal(variant.mime, "image/webp");
  assert.ok(variant.cacheable);
  assert.ok(variant.bytes.length < bytes.length);
  const metadata = await sharp(variant.bytes).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 256);
  assert.equal(metadata.hasAlpha, true);
  const raster = await sharp(variant.bytes).raw().toBuffer();
  assert.equal(raster[3], 0);
  assert.equal(raster[(230 * 4) + 3], 128);
  assert.equal(raster[(480 * 4) + 3], 255);
  assert.deepEqual(bytes, copy);
  const small = await sharp(bytes).resize(32, 16).png().toBuffer();
  const smallVariant = await encodeWorldArtwork({ mime: "image/png", bytes: small }, 256);
  assert.equal((await sharp(smallVariant.bytes).metadata()).width, 32);
});

test("unsupported and failed artwork conversions retain the immutable original", async () => {
  const gif = { mime: "image/gif", bytes: Buffer.from("preserve animation") };
  assert.deepEqual(await encodeWorldArtwork(gif, 256), { ...gif, cacheable: true });
  const bad = { mime: "image/png", bytes: Buffer.from("not png") };
  assert.deepEqual(await encodeWorldArtwork(bad, 256), { ...bad, cacheable: false });
});

test("world image cache deduplicates requests, evicts oldest entries and bounds work", async () => {
  let reads = 0;
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  const service = createWorldArtworkService(async () => {
    reads++;
    await blocked;
    return { mime: "image/png", bytes: Buffer.alloc(8) };
  }, {
    maxBytes: 8, maxEntryBytes: 8, concurrency: 1, maxQueued: 1,
    encode: async artwork => ({ ...artwork, cacheable: true }),
  });
  const first = service.get(id, 256);
  assert.equal(first, service.get(id, 256));
  const queued = service.get(id, 512);
  await assert.rejects(service.get(id, 768), WorldArtworkBusyError);
  assert.equal(reads, 1);
  finish();
  await Promise.all([first, queued]);
  assert.equal(reads, 2);
  await service.get(id, 512);
  assert.equal(reads, 2);
  await service.get(id, 256);
  assert.equal(reads, 3);
});

test("player prefetch shares the live query cache and loading uses the actual new scene", () => {
  assert.deepEqual(playerWorldSceneQuery("haunted_woods").queryKey, ["/api/worlds", "haunted_woods", "player-scene"]);
  assert.equal(playerWorldSceneQuery("haunted_woods").staleTime, 10_000);
  const app = readFileSync("client/src/App.tsx", "utf8");
  const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");
  const player = readFileSync("client/src/pages/WorldScenePlayerPage.tsx", "utf8");
  const overlay = readFileSync("client/src/components/world/NewWorldLoadingOverlay.tsx", "utf8");
  assert.match(app, /enabled: isThemed && !newWorldActive/);
  assert.match(app, /newWorldActive\s*\? <NewWorldLoadingOverlay/);
  assert.match(map, /prefetchQuery\(playerWorldSceneQuery\(w.id\)\);\s*navigate\(`\/world\/\$\{w.id\}`\)/);
  assert.match(player, /\.\.\.playerWorldSceneQuery\(worldId\)/);
  assert.match(player, /refetchInterval: 20_000/);
  assert.match(player, /nearby && art && <WorldSceneArtwork/);
  assert.match(player, /!nearby && !effectsNearby && p.kind !== "npc" && !p.legacyLocationId/);
  assert.doesNotMatch(player, /player-world-zoom-(in|out)/);
  assert.match(player, /pinch.current.zoom \* distance \/ pinch.current.distance/);
  assert.match(player, /onPointerMove=\{onMove\}/);
  assert.doesNotMatch(overlay, /WorldLoadingScreen|<img|MIN_MS|bgUrl/);
});
