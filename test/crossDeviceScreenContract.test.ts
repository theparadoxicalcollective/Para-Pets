import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateStageLayout,
  calculateViewportSurfaceRect,
  DESIGN_H,
  DESIGN_W,
} from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

const app = read("client/src/App.tsx");
const scenePortal = read("client/src/components/ViewportScenePortal.tsx");
const backdropPortal = read("client/src/components/ViewportBackdropPortal.tsx");
const hudPortal = read("client/src/components/ViewportHudPortal.tsx");
const modalPortal = read("client/src/components/ViewportModalPortal.tsx");
const home = read("client/src/pages/HomePage.tsx");
const map = read("client/src/pages/MapPage.tsx");
const aquarium = read("client/src/pages/AquariumPage.tsx");
const stageViewport = read("client/src/lib/stageViewport.ts");
const shell = read("client/src/tabletStageShell.css");
const spotlight = read("client/src/components/QuestGuideSpotlight.tsx");

test("cross-device contract keeps iPhone 12 as the exact authored reference", () => {
  assert.equal(DESIGN_W, 390);
  assert.equal(DESIGN_H, 844);
  const phone = calculateStageLayout(390, 844);
  assert.equal(phone.scale, 1);
  assert.equal(phone.left, 0);
  assert.equal(phone.top, 0);
  assert.equal(phone.designWidth, 390);
  assert.equal(phone.designHeight, 844);
  assert.equal(phone.coordinateOwner, "viewport");
});

test("tablet and desktop viewport surfaces cover the physical camera while canonical geometry remains 390x844", () => {
  for (const [width, height] of [[768, 1024], [834, 1194], [1440, 900]] as const) {
    const layout = calculateStageLayout(width, height, 0, 0, { fitPortraitReference: height > width });
    const surface = calculateViewportSurfaceRect(layout);
    assert.equal(layout.designWidth, 390);
    assert.equal(layout.designHeight, 844);
    assert.ok(Math.abs(layout.left + surface.left * layout.scale) < 1e-8);
    assert.ok(Math.abs(layout.top + surface.top * layout.scale) < 1e-8);
    assert.ok(Math.abs(layout.left + (surface.left + surface.width) * layout.scale - width) < 1e-8);
    assert.ok(Math.abs(layout.top + (surface.top + surface.height) * layout.scale - height) < 1e-8);
  }
});

test("GameStage exposes separate backdrop scene HUD and modal ownership without widening stage content", () => {
  assert.match(app, /id="game-stage-content"/);
  assert.match(app, /width: layout\.designWidth/);
  assert.match(app, /height: layout\.designHeight/);
  assert.match(app, /id="game-viewport-backdrop"/);
  assert.match(app, /id="game-viewport-scene"/);
  assert.match(app, /id="game-viewport-hud"/);
  assert.match(modalPortal, /const VIEWPORT_HUD_ID = "game-viewport-hud"/);
  assert.match(modalPortal, /zIndex: 20000/);
});

test("scene and backdrop portals preserve native-phone inline content while HUD/modal keep their established HUD ownership", () => {
  for (const source of [scenePortal, backdropPortal]) {
    assert.match(source, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
  }
  assert.match(hudPortal, /const HUD_TARGET_ID = "game-viewport-hud"/);
  assert.match(hudPortal, /return target \? createPortal\(children, target\) : null/);
  assert.match(modalPortal, /const VIEWPORT_HUD_ID = "game-viewport-hud"/);
  assert.match(modalPortal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});

test("Active Pet keeps authored pet and action-ring geometry while scenery and blocking backdrop can expand", () => {
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
  assert.match(home, /ref=\{petContainerRef\}/);
  assert.match(home, /data-testid="active-pet-action-canonical-ring"/);
  assert.match(home, /<ViewportHudPortal>[\s\S]*data-testid="active-pet-action-viewport-backdrop"/);
});

test("World Map expands as one scene but saved worlds remain percentage-owned by the map", () => {
  assert.match(map, /<ViewportScenePortal>/);
  assert.match(map, /data-testid="world-map-viewport-camera"/);
  assert.match(map, /ref=\{mapRef\}/);
  assert.match(map, /left: `\$\{pos\.x\}%`/);
  assert.match(map, /top: `\$\{pos\.y\}%`/);
  assert.match(map, /origPosX: w\.posX/);
  assert.match(map, /origPosY: w\.posY/);
  assert.match(map, /data-quest-guide-pan-surface/);
});

test("Aquarium owns the larger-device presentation without widening its fish swim plane", () => {
  assert.doesNotMatch(aquarium, /ViewportBackdropPortal/);
  assert.match(aquarium, /data-testid="aquarium-viewport-backdrop"/);
  assert.doesNotMatch(aquarium, /<ViewportScenePortal>/);
  assert.match(aquarium, /left: `\$\{f\.x\}%`, top: `\$\{f\.y\}%`/);
  assert.match(aquarium, /const py = \(\(e\.clientY - rect\.top\) \/ rect\.height\) \* 100/);
  assert.match(aquarium, /if \(py < 78\) addFish\(d\.fish\)/);

  assert.match(stageViewport, /calculateViewportSurfaceRect\(layout\)/);
  assert.match(stageViewport, /--viewport-surface-left/);
  assert.match(stageViewport, /--viewport-surface-right/);
  assert.match(stageViewport, /--viewport-surface-top/);
  assert.match(stageViewport, /--viewport-surface-bottom/);

  assert.doesNotMatch(shell, /#game-stage\[data-coordinate-owner="stage"\] #game-stage-content:has\(\[data-testid="aquarium-page"\]\)/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-testid="aquarium-page"\][\s\S]*overflow: visible !important/);
});

test("guided quests retain explicit target-only pan and tour interaction modes across camera types", () => {
  assert.match(spotlight, /mode === "pan"/);
  assert.match(spotlight, /mode === "tour"/);
  assert.match(spotlight, /blockingGuide = false/);
  assert.match(spotlight, /data-quest-guide-pan-surface/);
  assert.match(spotlight, /document\.addEventListener\("pointerdown", onPointerBoundary, true\)/);
  assert.match(spotlight, /document\.addEventListener\("click", onClick, true\)/);
});
