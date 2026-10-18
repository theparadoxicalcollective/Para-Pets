import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateExpandedWorldCameraPanMargin,
  calculateExpandedWorldCameraScale,
  calculateWorldFitScale,
  WORLD_MAP_WIDTH,
} from "../client/src/lib/worldViewport";

const read = (path: string) => readFileSync(path, "utf8");

test("WorldPage owns map controls in the scene rather than the persistent viewport HUD", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  assert.match(source, /import ViewportScenePortal from "@\/components\/ViewportScenePortal"/);
  assert.doesNotMatch(source, /import ViewportHudPortal from "@\/components\/ViewportHudPortal"/);
  assert.match(source, /expandedCamera: true/);
  assert.match(source, /<ViewportScenePortal enabled=\{!worldMapCameraBlocked\}>/);

  const sceneStart = source.indexOf("<ViewportScenePortal enabled={!worldMapCameraBlocked}>");
  const camera = source.indexOf('data-testid="world-expanded-camera"', sceneStart);
  const controls = source.indexOf('data-testid="world-map-only-controls"', camera);
  const hud = source.indexOf('data-testid="world-persistent-hud"', controls);
  const backButton = source.indexOf('data-testid="button-back-to-map"', hud);
  const decorButton = source.indexOf('data-testid="button-world-decor"', hud);
  const sceneEnd = source.indexOf("</ViewportScenePortal>", controls);
  const shopPanel = source.indexOf("{showShop && (", sceneEnd);

  assert.ok(sceneStart >= 0 && camera > sceneStart);
  assert.ok(controls > camera && hud > controls && hud < sceneEnd);
  assert.ok(backButton > hud && backButton < sceneEnd);
  assert.ok(decorButton > hud && decorButton < sceneEnd);
  assert.ok(shopPanel > sceneEnd, "shop panel must not move into expanded map camera");
  assert.match(source.slice(camera, sceneEnd), /\{!worldMapCameraBlocked && \(\s*<div data-testid="world-map-only-controls"/);
});

test("World map controls preserve viewport-edge offsets without a fixed phone reference plane", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  const hudStart = source.indexOf('data-testid="world-persistent-hud"');
  const hudEnd = source.indexOf("</ViewportScenePortal>", hudStart);
  const hud = source.slice(hudStart, hudEnd);

  assert.match(hud, /data-testid="button-back-to-map"/);
  assert.match(hud, /bottom: 24/);
  assert.match(hud, /left: 16/);
  assert.match(hud, /data-testid="button-world-decor"/);
  assert.match(hud, /bottom: 82/);
  assert.match(hud, /right: 16/);
  assert.match(hud, /pointerEvents: "auto"/);
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
    const expandedPolicyPhoneScale = calculateExpandedWorldCameraScale(390, 844, mapHeight);
    assert.equal(expandedPolicyPhoneScale, legacyPhoneScale);
  }
});

test("expanded tablet camera fills the device while retaining real draggable map beyond every edge", () => {
  const mapHeight = 1440;
  const phoneScale = calculateExpandedWorldCameraScale(390, 844, mapHeight);
  const tabletWidth = 683;
  const tabletHeight = 911;
  const tabletScale = calculateExpandedWorldCameraScale(tabletWidth, tabletHeight, mapHeight);
  const margin = calculateExpandedWorldCameraPanMargin(tabletWidth, tabletHeight);

  assert.ok(tabletScale >= phoneScale);
  assert.ok(WORLD_MAP_WIDTH * tabletScale >= tabletWidth + margin * 2 - 1e-9);
  assert.ok(mapHeight * tabletScale >= tabletHeight + margin * 2 - 1e-9);
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
  assert.match(locations, /dragWorldPlacementPercent\([\s\S]*?rect\.width,[\s\S]*?rect\.height,[\s\S]*?WORLD_PLACEMENT_BOUNDS\.location/);

  assert.match(decor, /const rect = areaRef\.current\.getBoundingClientRect\(\)/);
  assert.match(decor, /clientPointToWorldPlacementPercent\([\s\S]*?rect,[\s\S]*?WORLD_PLACEMENT_BOUNDS\.decor/);
  assert.match(decor, /dragWorldPlacementPercent\([\s\S]*?rect\.width,[\s\S]*?rect\.height,[\s\S]*?WORLD_PLACEMENT_BOUNDS\.decor/);
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

test("world camera controller measures the portal surface and uses local pointer scale", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(source, /const width = el\.clientWidth \|\| getDesignW\(\)/);
  assert.match(source, /const height = el\.clientHeight \|\| DESIGN_H/);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /expandedCamera && !getStageSurface\(\)\.viewportOwned/);
  assert.doesNotMatch(source, /clientDeltaToStage\(/);
  assert.match(source, /viewportElement\?\.getBoundingClientRect\(\)/);
  assert.match(source, /frameWRef\.current \/ rect\.width/);
  assert.match(source, /frameHRef\.current \/ rect\.height/);
  assert.match(source, /event\.clientX - mapPanStartRef\.current\.x/);
  assert.match(source, /event\.clientY - mapPanStartRef\.current\.y/);
  assert.doesNotMatch(source, /const stageScale = getStageScale\(\)/);
});

test("expanded WorldPage reuses the merged viewport-scene contract instead of creating a second camera root", () => {
  const app = read("client/src/App.tsx");
  const portal = read("client/src/components/ViewportScenePortal.tsx");

  assert.match(app, /id="game-viewport-scene"/);
  assert.match(portal, /const VIEWPORT_SCENE_ID = "game-viewport-scene"/);
  assert.match(portal, /stage\.dataset\.viewportSceneActive = "true"/);
});


test("expanded camera policy keeps an explorable overscan margin instead of stopping at exact cover", () => {
  const viewport = read("client/src/lib/worldViewport.ts");
  assert.match(viewport, /WORLD_EXPANDED_CAMERA_PAN_RATIO = 0\.06/);
  assert.match(viewport, /calculateExpandedWorldCameraPanMargin/);
  assert.match(viewport, /frameWidth \+ panMargin \* 2/);
  assert.match(viewport, /frameHeight \+ panMargin \* 2/);
  assert.match(viewport, /const coverScale = Math\.max\(frameWidth \/ safeMapWidth, frameHeight \/ safeMapHeight\)/);
  assert.match(viewport, /if \(Math\.min\(frameWidth, frameHeight\) < 600\) return coverScale/);
  assert.doesNotMatch(viewport, /WORLD_REFERENCE_CAMERA_(WIDTH|HEIGHT)/);
});


test("world admin decor drag preview uses device viewport rather than the scaled stage", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /data-testid="world-decor-viewport-drag-ghost"/);
  assert.match(source, /left: panelDragGhost\.clientX - 32/);
  assert.match(source, /top: panelDragGhost\.clientY - 32/);
  assert.match(source, /document\.body,/);
});
