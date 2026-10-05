import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateStageLayout,
  calculateViewportSurfaceRect,
} from "../client/src/lib/stage";
import {
  cameraTarget,
  clearingWorldSize,
} from "../client/src/lib/elysianClearingCombatMath";

const read = (path: string) => readFileSync(path, "utf8");

test("expanded viewport scene maps to the full visible device without changing stage geometry", () => {
  for (const layout of [
    calculateStageLayout(834, 1194, 0, 0, { fitPortraitReference: true }),
    calculateStageLayout(1024, 1366, 0, 0, { fitPortraitReference: true }),
    calculateStageLayout(1920, 1080),
  ]) {
    const surface = calculateViewportSurfaceRect(layout);
    const left = layout.left + surface.left * layout.scale;
    const top = layout.top + surface.top * layout.scale;
    const right = layout.left + (surface.left + surface.width) * layout.scale;
    const bottom = layout.top + (surface.top + surface.height) * layout.scale;

    assert.ok(Math.abs(left) < 1e-9);
    assert.ok(Math.abs(top) < 1e-9);
    assert.ok(Math.abs(right - layout.viewportWidth) < 1e-9);
    assert.ok(Math.abs(bottom - layout.viewportHeight) < 1e-9);
    assert.equal(layout.designWidth, 390);
    assert.equal(layout.designHeight, 844);
  }
});

test("iPhone 12 viewport surface remains the exact reference rectangle", () => {
  const layout = calculateStageLayout(390, 844);
  assert.deepEqual(calculateViewportSurfaceRect(layout), {
    left: 0,
    top: 0,
    width: 390,
    height: 844,
  });
  assert.equal(layout.scale, 1);
  assert.equal(layout.coordinateOwner, "viewport");
});

test("Clearing world canvas preserves artwork aspect instead of widening coordinates for tablets", () => {
  const phone = clearingWorldSize({ width: 390, height: 844 }, 2 / 3);
  const tablet = clearingWorldSize({ width: 683, height: 911 }, 2 / 3);

  assert.ok(Math.abs(phone.width / phone.height - 2 / 3) < 1e-12);
  assert.ok(Math.abs(tablet.width / tablet.height - 2 / 3) < 1e-12);
  assert.ok(phone.width > 390, "phone should still camera-pan across the wider artwork");
  assert.ok(tablet.width < 683, "wide tablet reveals the whole authored canvas instead of inventing world width");
});

test("camera pans oversized worlds but centers authored worlds smaller than the device camera", () => {
  assert.deepEqual(
    cameraTarget({ x: 0, y: 0 }, { width: 680, height: 1680 }, { width: 400, height: 800 }),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    cameraTarget({ x: 1, y: 1 }, { width: 680, height: 1680 }, { width: 400, height: 800 }),
    { x: 280, y: 880 },
  );

  const centered = cameraTarget(
    { x: 0.9, y: 0.2 },
    { width: 607, height: 911 },
    { width: 683, height: 911 },
  );
  assert.equal(centered.x, -38);
  assert.equal(centered.y, 0);
});

test("only explicitly opted-in scenes use the device viewport scene portal", () => {
  const clearing = read("client/src/pages/ElysianBayouClearingPage.tsx");
  const config = read("client/src/lib/exploreLocations.ts");
  const portal = read("client/src/components/ViewportScenePortal.tsx");

  assert.match(config, /cameraMode\?: "canonical-stage" \| "device-viewport"/);
  assert.match(clearing, /cameraMode: "device-viewport"/);
  assert.match(clearing, /<ViewportScenePortal>\{scene\}<\/ViewportScenePortal>/);
  assert.match(clearing, /data-testid="elysian-clearing-camera-surface"/);
  assert.match(portal, /game-viewport-scene/);
  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
});

test("GameStage provides a scene surface only on the stage-owned presentation path", () => {
  const app = read("client/src/App.tsx");

  assert.match(app, /layout\.coordinateOwner === "stage" && \(/);
  assert.match(app, /id="game-viewport-scene"/);
  assert.match(app, /left: sceneRect\.left/);
  assert.match(app, /top: sceneRect\.top/);
  assert.match(app, /width: sceneRect\.width/);
  assert.match(app, /height: sceneRect\.height/);
  assert.match(app, /pointerEvents: "none"/);

  const documentBranchStart = app.indexOf("if (shouldUseDocumentLayout");
  const documentBranchEnd = app.indexOf("\n  return (", documentBranchStart);
  const viewportOwnedBranch = app.slice(documentBranchStart, documentBranchEnd);
  assert.ok(documentBranchStart >= 0 && documentBranchEnd > documentBranchStart);
  assert.doesNotMatch(viewportOwnedBranch, /game-viewport-scene/);
});

test("Clearing keeps a non-distorted authored foreground plus a viewport-only environmental extension", () => {
  const scene = read("client/src/components/WalkAroundScene.tsx");

  assert.match(scene, /className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-md pointer-events-none"/);
  assert.match(scene, /style=\{\{ objectFit: config\.aspectLayout \? "contain" : "cover"/);

  const worldLayerStart = scene.indexOf('data-testid="walkaround-world-layer"');
  const blurredExtension = scene.indexOf("scale-110 object-cover opacity-45 blur-md");
  assert.ok(blurredExtension >= 0 && blurredExtension < worldLayerStart);
});

test("full-device Clearing removes only the centered presentation frame, not gameplay coordinates", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");
  const css = read("client/src/tabletStageShell.css");

  assert.match(portal, /enabled = true/);
  assert.match(portal, /stage\.dataset\.viewportSceneActive = "true"/);
  assert.match(css, /#game-stage\[data-viewport-scene-active="true"\]/);
  assert.match(css, /outline: 0/);
  assert.match(css, /box-shadow: none/);

  const stage = read("client/src/lib/stage.ts");
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
});
