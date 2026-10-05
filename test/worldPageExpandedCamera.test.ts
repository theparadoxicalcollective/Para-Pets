import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateWorldFitScale,
  WORLD_MAP_WIDTH,
} from "../client/src/lib/worldViewport";

const read = (path: string) => readFileSync(path, "utf8");

test("WorldPage opts only the map camera into the expanded viewport scene", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(source, /import ViewportScenePortal from "@\/components\/ViewportScenePortal"/);
  assert.match(source, /fitFullComposition: true/);
  assert.match(source, /<ViewportScenePortal enabled=\{!worldMapCameraBlocked\}>/);
  assert.match(source, /data-testid="world-expanded-camera"/);

  const portalStart = source.indexOf("<ViewportScenePortal enabled={!worldMapCameraBlocked}>");
  const portalEnd = source.indexOf("</ViewportScenePortal>", portalStart);
  const backButton = source.indexOf('data-testid="button-back-to-map"', portalEnd);
  const shopPanel = source.indexOf("{showShop && (", portalEnd);

  assert.ok(portalStart >= 0 && portalEnd > portalStart);
  assert.ok(backButton > portalEnd, "map/back UI stays on canonical stage");
  assert.ok(shopPanel > portalEnd, "shop panel must not move into expanded map camera");
});

test("all WorldPage worlds keep the same authored 1080-wide coordinate canvas", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  const viewport = read("client/src/lib/worldViewport.ts");

  assert.equal(WORLD_MAP_WIDTH, 1080);
  assert.match(source, /const MAP_W = WORLD_MAP_WIDTH/);
  assert.match(source, /width: MAP_W/);
  assert.match(source, /height: mapH/);
  assert.match(viewport, /const WORLD_MAP_WIDTH = 1080/);
});

test("world map height continues to come from the real background aspect ratio", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(source, /img\.naturalWidth > 0 && img\.naturalHeight > 0/);
  assert.match(
    source,
    /worldDefinition\?\.fixedMapHeight \?\? Math\.round\(MAP_W \* img\.naturalHeight \/ img\.naturalWidth\)/,
  );
  assert.match(source, /setAuthoredMapHeight\(h\)/);
});

test("expanded map scale preserves the iPhone 12 reference zoom", () => {
  for (const mapHeight of [1440, 1600, 1920, 2160]) {
    const legacyPhoneScale = calculateWorldFitScale(390, 844, mapHeight, false);
    const expandedPolicyPhoneScale = calculateWorldFitScale(390, 844, mapHeight, true);
    assert.equal(expandedPolicyPhoneScale, legacyPhoneScale);
  }
});

test("expanded tablet camera can reveal more authored map without zooming below phone scale", () => {
  const mapHeight = 1440;
  const phoneScale = calculateWorldFitScale(390, 844, mapHeight, true);
  const tabletScale = calculateWorldFitScale(683, 911, mapHeight, true);

  assert.ok(tabletScale >= phoneScale);
  assert.ok(WORLD_MAP_WIDTH * tabletScale <= 683 + 1e-9);
  assert.ok(mapHeight * tabletScale <= 911 + 1e-9);
});

test("world locations and decor remain percentage-positioned inside the transformed authored map", () => {
  const page = read("client/src/pages/WorldPage.tsx");

  assert.match(page, /left: `\$\{dpos\.x\}%`/);
  assert.match(page, /top: `\$\{dpos\.y\}%`/);
  assert.match(page, /<WorldLocations/);
  assert.match(page, /dragPosition=\{dragPos\}/);
});

test("Admin drag math continues deriving percentages from the live transformed map rectangle", () => {
  const locations = read("client/src/worlds/useWorldLocationAdminController.ts");
  const decor = read("client/src/worlds/useWorldDecorAdminController.ts");

  assert.match(locations, /const rect = areaRef\.current\.getBoundingClientRect\(\)/);
  assert.match(locations, /const pxPerPercX = rect\.width \/ 100/);
  assert.match(locations, /const pxPerPercY = rect\.height \/ 100/);
  assert.match(locations, /origPosX \+ dx \/ pxPerPercX/);
  assert.match(locations, /origPosY \+ dy \/ pxPerPercY/);

  assert.match(decor, /const rect = areaRef\.current\.getBoundingClientRect\(\)/);
  assert.match(decor, /posX: \(\(event\.clientX - rect\.left\) \/ rect\.width\) \* 100/);
  assert.match(decor, /posY: \(\(event\.clientY - rect\.top\) \/ rect\.height\) \* 100/);
  assert.match(decor, /const pxPerPercX = rect\.width \/ 100/);
  assert.match(decor, /const pxPerPercY = rect\.height \/ 100/);
});

test("expanded WorldPage camera suspends behind modal and location UI", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  const portal = read("client/src/components/ViewportScenePortal.tsx");

  assert.match(source, /const worldMapCameraBlocked = Boolean\(/);
  for (const state of [
    "showProfile",
    "showLocationView",
    "showShop",
    "showFishing",
    "showSellFish",
    "showBattlePrep",
    "showBattle",
    "showCaveEntry",
    "cauldronOpen",
    "showAddLocation",
    "showDecorPanel",
  ]) {
    assert.match(source, new RegExp(state));
  }

  assert.match(portal, /enabled = true/);
  assert.match(portal, /if \(!enabled \|\| !target\) return/);
  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
});

test("world camera controller measures the actual portal surface and keeps shared stage input scale", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(source, /const width = el\.clientWidth \|\| getDesignW\(\)/);
  assert.match(source, /const height = el\.clientHeight \|\| DESIGN_H/);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /const stageScale = getStageScale\(\)/);
  assert.match(source, /event\.clientX - mapPanStartRef\.current\.x\) \/ stageScale/);
  assert.match(source, /event\.clientY - mapPanStartRef\.current\.y\) \/ stageScale/);
});

test("expanded WorldPage reuses the merged viewport-scene contract instead of creating a second camera root", () => {
  const app = read("client/src/App.tsx");
  const portal = read("client/src/components/ViewportScenePortal.tsx");

  assert.match(app, /id="game-viewport-scene"/);
  assert.match(portal, /const VIEWPORT_SCENE_ID = "game-viewport-scene"/);
  assert.match(portal, /stage\.dataset\.viewportSceneActive = "true"/);
});
