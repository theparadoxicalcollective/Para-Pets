import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateExpandedWorldCameraPanMargin,
  calculateExpandedWorldCameraScale,
  calculateWorldFitScale,
  clampWorldMapOffset,
} from "../client/src/lib/worldViewport";

const read = (path: string) => readFileSync(path, "utf8");

const MAP_W = 1080;
const MAP_H = 691;

test("Pet Central keeps its locked authored coordinate canvas", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");

  assert.match(source, /const MAP_W = 1080/);
  assert.match(source, /const KC_MAP_H = 691/);
  assert.match(source, /NEVER change after admin has placed KC doors\/decor/);
  assert.match(source, /width: MAP_W/);
  assert.match(source, /height: mapH/);

  assert.match(source, /left: `\$\{pos\.x\}%`/);
  assert.match(source, /top: `\$\{pos\.y\}%`/);
  assert.match(source, /left: `\$\{dpos\.x\}%`/);
  assert.match(source, /top: `\$\{dpos\.y\}%`/);
  assert.match(source, /left: `\$\{door\.posX\}%`/);
  assert.match(source, /top: `\$\{door\.posY\}%`/);
});

test("Pet Central page root no longer creates a fixed stacking context above the expanded scene", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");
  const rootStart = source.indexOf('data-testid="pet-central-page"');
  const rootBlock = source.slice(rootStart, rootStart + 260);

  assert.ok(rootStart >= 0);
  assert.match(rootBlock, /className="relative w-full h-screen-frame overflow-hidden"/);
  assert.doesNotMatch(rootBlock, /fixed inset-0 z-50/);
});

test("Pet Central uses the expanded scene portal while persistent controls use the device HUD", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");

  assert.match(source, /import ViewportScenePortal from "@\/components\/ViewportScenePortal"/);
  assert.match(source, /import ViewportHudPortal from "@\/components\/ViewportHudPortal"/);
  assert.match(source, /<ViewportScenePortal enabled=\{!petCentralCameraBlocked\}>/);
  assert.match(source, /data-testid="pet-central-expanded-camera"/);

  const sceneStart = source.indexOf("<ViewportScenePortal enabled={!petCentralCameraBlocked}>");
  const sceneEnd = source.indexOf("</ViewportScenePortal>", sceneStart);
  const hudStart = source.indexOf("<ViewportHudPortal>", sceneEnd);
  const hud = source.indexOf('data-testid="pet-central-persistent-hud"', hudStart);
  const hudEnd = source.indexOf("</ViewportHudPortal>", hudStart);

  assert.ok(sceneStart >= 0 && sceneEnd > sceneStart);
  assert.ok(hudStart > sceneEnd);
  assert.ok(hud > hudStart && hud < hudEnd);
  assert.match(source.slice(hudStart, hudEnd), /data-testid="button-open-profile"/);
  assert.match(source.slice(hudStart, hudEnd), /data-testid="button-kc-coin-shop"/);
  assert.match(source, /data-testid="pet-central-joystick-hud"/);
});

test("Pet Central expanded camera uses the shared explorable World framing policy", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");

  assert.match(source, /calculateExpandedWorldCameraScale\(/);
  assert.match(source, /calculateWorldFitScale\(/);
  assert.match(source, /clampWorldMapOffset\(/);
  assert.match(source, /const expandedCamera = !getStageSurface\(\)\.viewportOwned/);
  assert.match(source, /worldCameraPointerDelta\(/);
  assert.doesNotMatch(source, /const dx = \(e\.clientX - mapPanStartRef\.current\.x\) \/ getStageScale\(\)/);

  assert.match(source, /const canPanX = MAP_W \* sc > frameWRef\.current \+ 0\.5/);
  assert.match(source, /const canPanY = mapHRef\.current \* sc > frameHRef\.current \+ 0\.5/);
  assert.match(source, /onLostPointerCapture=\{handleVpPointerCancel\}/);
});

test("iPhone 12 Pet Central keeps the exact existing cover scale and no vertical camera travel", () => {
  const referenceScale = calculateWorldFitScale(390, 844, MAP_H, false, MAP_W);
  const expandedPolicyScale = calculateExpandedWorldCameraScale(390, 844, MAP_H, MAP_W);

  assert.equal(expandedPolicyScale, referenceScale);
  assert.equal(referenceScale, 844 / MAP_H);

  const centered = clampWorldMapOffset(
    (390 - MAP_W * referenceScale) / 2,
    (844 - MAP_H * referenceScale) / 2,
    referenceScale,
    390,
    844,
    MAP_H,
    MAP_W,
  );
  assert.ok(Math.abs(centered.y) < 1e-9);
});

test("tablet Pet Central fills the device and keeps real map available in both drag axes", () => {
  const frameW = 683;
  const frameH = 911;
  const margin = calculateExpandedWorldCameraPanMargin(frameW, frameH);
  const scale = calculateExpandedWorldCameraScale(frameW, frameH, MAP_H, MAP_W);

  assert.ok(MAP_W * scale >= frameW + margin * 2 - 1e-9);
  assert.ok(MAP_H * scale >= frameH + margin * 2 - 1e-9);

  const first = clampWorldMapOffset(9999, 9999, scale, frameW, frameH, MAP_H, MAP_W);
  const last = clampWorldMapOffset(-9999, -9999, scale, frameW, frameH, MAP_H, MAP_W);

  assert.equal(first.x, 0);
  assert.equal(first.y, 0);
  assert.ok(last.x < 0);
  assert.ok(last.y < 0);
});

test("roaming-pet camera follow now clamps both axes without changing saved pet percentages", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");

  assert.match(source, /const petMapX = \(nx \/ 100\) \* MAP_W \* sc/);
  assert.match(source, /const petMapY = \(ny \/ 100\) \* mapHRef\.current \* sc/);
  assert.match(source, /frameWRef\.current \/ 2 - petMapX/);
  assert.match(source, /frameHRef\.current \/ 2 - petMapY/);
  assert.match(source, /setMapX\(newMapX\)/);
  assert.match(source, /setMapY\(newMapY\)/);

  assert.match(source, /posX: nx, posY: ny/);
  assert.match(source, /Math\.max\(5,\s*Math\.min\(92, rawPos\.x\)\)/);
  assert.match(source, /Math\.max\(15, Math\.min\(90, rawPos\.y\)\)/);
});

test("blocking Pet Central panels suspend the expanded camera instead of being covered by it", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");

  assert.match(source, /const petCentralCameraBlocked = Boolean\(/);
  for (const state of [
    "showProfile",
    "showFriendsPanel",
    "showDecorPanel",
    "showPlacesPanel",
    "showLocShop",
    "showDoorsPanel",
    "activeDoorId",
    "selectedPet",
    "selectedPlayerId",
    "showDoorItemPicker",
  ]) {
    assert.match(source, new RegExp(state));
  }

  assert.match(source, /<ViewportScenePortal enabled=\{!petCentralCameraBlocked\}>/);
  assert.match(source, /!petCentralCameraBlocked && \([\s\S]*?data-testid="pet-central-joystick-hud"/);
});

test("door interior panning measures the actual camera instead of global stage scale", () => {
  const source = read("client/src/pages/PetWorldPage.tsx");
  assert.match(source, /const cw = camera\.clientWidth/);
  assert.match(source, /const ch = camera\.clientHeight/);
  assert.match(source, /worldCameraPointerDelta\(bgPanDragRef\.current\.startX - e\.clientX, 0, camera\)/);
  assert.doesNotMatch(source, /getStageScale\(\)/);
});
