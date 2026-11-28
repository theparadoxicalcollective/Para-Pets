import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { WORLD_ARTWORK_SIZES, worldArtworkSize, worldArtworkUrl } from "../shared/worlds/worldArtworkSize";
import { worldEditorCameraGeometry, worldEditorMinZoom } from "../client/src/lib/worldEditorCamera";
import { clampPlayerWorldZoom } from "../shared/worlds/worldScenePublication";
import { parkTerrainRasterTileWindow, PARK_TERRAIN_TILE_PIXELS } from "../client/src/lib/petParkTerrain";
import { PLAYER_WORLD_INITIAL_ZOOM, PLAYER_WORLD_CULL_CELL, playerWorldCullOrigin, playerWorldRoomCamera, playerWorldArtworkVisibility, playerWorldSceneQuery } from "../client/src/lib/playerWorldScene";
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

test("player camera retains touch capture through a child capture transfer and coalesces camera work", () => {
  const source = readFileSync("client/src/pages/WorldScenePlayerPage.tsx", "utf8");
  assert.match(source, /event.type === "lostpointercapture" && event.target !== event.currentTarget/);
  assert.match(source, /cameraFrame.current = requestAnimationFrame/);
  assert.match(source, /drag.current.pan.x \+ dx/);
  assert.match(source, /pinch.current.center.x - pinch.current.pan.x/);
  assert.match(source, /translate3d/);
});

test("player plots reuse Pet Park actions with world-scoped state and protected player routes", () => {
  const page = readFileSync("client/src/pages/WorldScenePlayerPage.tsx", "utf8");
  const garden = readFileSync("server/routes/worldGarden.routes.ts", "utf8");
  const refill = readFileSync("server/routes/worldGardenRefill.routes.ts", "utf8");
  const access = readFileSync("server/worldGardenAccess.ts", "utf8");
  assert.match(page, /<PetParkGardenMenu/);
  assert.match(page, /<PetParkCropArtwork/);
  assert.match(page, /<PetParkWaterRefillPopup/);
  assert.match(page, /actionUrlPrefix=\{gardenPrefix\}/);
  assert.match(page, /isInteractive = [^;]*isGardenPlot/);
  for (const routes of [garden, refill]) {
    assert.match(routes, /"preview", "player"/);
    assert.match(routes, /worldGardenAccess\(tx, userId, worldId, mode,/);
  }
  assert.match(access, /effectiveWorldLocked\(worldId, saved\?\.value\)/);
  assert.match(access, /mode === "preview"/);
});


test("overscanned camera cells never omit an actually visible object during panning", () => {
  const viewport = { width: 390, height: 844 };
  const expanded = { width: viewport.width + 2 * PLAYER_WORLD_CULL_CELL, height: viewport.height + 2 * PLAYER_WORLD_CULL_CELL };
  for (const x of [-490, -193, -96, -1, 0, 1, 95, 96]) {
    for (const y of [-197, -1, 0, 96]) {
      for (const objectX of [0, 300, 390, 500, 750, 1000]) {
        for (const objectY of [0, 200, 900, 1100]) {
          if (!playerWorldArtworkVisibility(objectX + x, objectY + y, 100, 100, viewport).nearby) continue;
          assert.ok(playerWorldArtworkVisibility(objectX + playerWorldCullOrigin(x) + PLAYER_WORLD_CULL_CELL,
            objectY + playerWorldCullOrigin(y) + PLAYER_WORLD_CULL_CELL, 100, 100, expanded).nearby);
        }
      }
    }
  }
});

test("rooms fill phone and tablet viewports at their natural aspect and clamp both camera axes", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
    for (const aspect of [700 / 1100, 2, 800 / 1000]) {
      const room = playerWorldRoomCamera(viewport, aspect);
      assert.ok(room.width >= viewport.width - 1e-8 && room.height >= viewport.height - 1e-8);
      assert.ok(Math.abs(room.width / room.height - aspect) < 1e-8);
      assert.ok(Math.abs(room.pan.x + room.width / 2 - viewport.width / 2) < 1e-8);
      assert.ok(Math.abs(room.pan.y + room.height / 2 - viewport.height / 2) < 1e-8);
      const start = playerWorldRoomCamera(viewport, aspect, { x: -10, y: -10 });
      const end = playerWorldRoomCamera(viewport, aspect, { x: 10, y: 10 });
      assert.deepEqual(start.pan, { x: 0, y: 0 });
      assert.ok(Math.abs(end.pan.x - (viewport.width - room.width)) < 1e-8);
      assert.ok(Math.abs(end.pan.y - (viewport.height - room.height)) < 1e-8);
    }
  }
});

test("the player default camera is slightly wider without exposing beyond the world", () => {
  for (const viewport of [{ width:390,height:844 }, { width:834,height:1194 }, {width:1194,height:834}]) {
    for (const level of [0,1,2,3,4]) {
      const {width,height}=viewport;
      const minimum=worldEditorMinZoom(width,height,level);
      const previous=worldEditorCameraGeometry(width,height,level,clampPlayerWorldZoom(1,minimum));
      const next=worldEditorCameraGeometry(width,height,level,clampPlayerWorldZoom(PLAYER_WORLD_INITIAL_ZOOM,minimum));
      assert.ok(next.sceneWidth>=width-1e-6 && next.sceneHeight>=height-1e-6);
      assert.ok(next.scale<=previous.scale+1e-8 && next.scale>=previous.scale*.9-1e-8);
      if (minimum<=PLAYER_WORLD_INITIAL_ZOOM) assert.ok(Math.abs(next.scale/previous.scale-.9)<1e-8);
    }
  }
});

test("the terrain tile window covers both edges of any backing-pixel raster", () => {
  for (const [x,y,width,height] of [[-100,-200,800,1700],[513,1025,512,512],[0,0,512,512],[723,593,1700,2436]]) {
    const tiles=parkTerrainRasterTileWindow(x,y,width,height);
    const tileSize=PARK_TERRAIN_TILE_PIXELS;
    assert.equal(new Set(tiles.map(tile=>tile.x+":"+tile.y)).size,tiles.length);
    for (const px of [x,x+width-1]) for (const py of [y,y+height-1]) {
      assert.equal(tiles.filter(t=>px>=t.x&&px<t.x+tileSize&&py>=t.y&&py<t.y+tileSize).length,1);
    }
    for(const t of tiles) assert.ok(t.x%tileSize===0&&t.y%tileSize===0);
  }
});
