import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateStageLayout,
  calculateViewportHudRect,
} from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

test("viewport HUD maps to real device edges while gameplay keeps its canonical stage", () => {
  for (const layout of [
    calculateStageLayout(834, 1194, 0, 0, { fitPortraitReference: true }),
    calculateStageLayout(1024, 1366, 0, 0, { fitPortraitReference: true }),
    calculateStageLayout(1366, 768),
    calculateStageLayout(1920, 1080),
  ]) {
    const hud = calculateViewportHudRect(layout);
    const renderedLeft = layout.left + hud.left * layout.scale;
    const renderedTop = layout.top + hud.top * layout.scale;
    const renderedRight = layout.left + (hud.left + hud.width) * layout.scale;
    const renderedBottom = layout.top + (hud.top + hud.height) * layout.scale;

    assert.ok(Math.abs(renderedLeft) < 1e-9);
    assert.ok(Math.abs(renderedTop) < 1e-9);
    assert.ok(Math.abs(renderedRight - layout.viewportWidth) < 1e-9);
    assert.ok(Math.abs(renderedBottom - layout.viewportHeight) < 1e-9);

    assert.equal(layout.designWidth, 390);
    assert.equal(layout.designHeight, 844);
  }
});

test("iPhone 11-style portrait reference HUD reaches the real device edges", () => {
  const layout = calculateStageLayout(414, 896, 0, 0, { fitPortraitReference: true });
  const hud = calculateViewportHudRect(layout);

  const renderedLeft = layout.left + hud.left * layout.scale;
  const renderedTop = layout.top + hud.top * layout.scale;
  const renderedRight = layout.left + (hud.left + hud.width) * layout.scale;
  const renderedBottom = layout.top + (hud.top + hud.height) * layout.scale;

  assert.equal(layout.coordinateOwner, "stage");
  assert.equal(layout.designWidth, 390);
  assert.equal(layout.designHeight, 844);
  assert.ok(Math.abs(renderedLeft) < 1e-9);
  assert.ok(Math.abs(renderedTop) < 1e-9);
  assert.ok(Math.abs(renderedRight - 414) < 1e-9);
  assert.ok(Math.abs(renderedBottom - 896) < 1e-9);
});

test("iPhone 12 HUD geometry remains exactly the existing viewport", () => {
  const layout = calculateStageLayout(390, 844);
  const hud = calculateViewportHudRect(layout);

  assert.deepEqual(hud, { left: 0, top: 0, width: 390, height: 844 });
  assert.equal(layout.scale, 1);
  assert.equal(layout.coordinateOwner, "viewport");
});

test("GameStage clips gameplay separately while allowing the HUD to reach device edges", () => {
  const app = read("client/src/App.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(app, /id="game-stage-content"/);
  assert.match(app, /data-testid="game-stage-content"/);
  assert.match(app, /id="game-viewport-hud"/);
  assert.match(app, /data-testid="game-viewport-hud"/);
  assert.match(app, /id="game-stage-content"[\s\S]*?overflow: "hidden"/);
  assert.match(app, /id="game-viewport-hud"[\\s\\S]{0,180}inset: 0/);
  assert.doesNotMatch(app, /expandedStage|scale\(\$\{layout\.scale\}\)/);
  for (const id of ["game-viewport-backdrop", "game-viewport-page", "game-viewport-scene"]) assert.ok(app.includes(`id="${id}"`));
  assert.match(stage, /const content = document\.getElementById\("game-stage-content"\)/);
});

test("Active Pet top bar uses the viewport HUD without changing the underlying pet composition", () => {
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(home, /ViewportHudPortal/);
  assert.match(home, /data-testid="viewport-hud-topbar"/);
  assert.match(home, /top: 18/);
  assert.match(home, /left: 0/);
  assert.match(home, /right: 0/);
  assert.match(home, /<TopBar user=\{currentUser\}/);

  // Pet/star composition remains on the canonical Home page below the portal.
  assert.match(home, /data-testid="display-pet-rarity-stars"/);
  assert.match(home, /paddingTop: "155px"/);
});

test("main navigation is device-edge anchored while its panels stay in the canonical stage", () => {
  const nav = read("client/src/components/FloatingNav.tsx");

  assert.match(nav, /<ViewportHudPortal>/);
  assert.match(nav, /bottom: 16/);
  assert.match(nav, /right: 12/);
  assert.match(nav, /pointerEvents: "auto"/);

  const portalEnd = nav.indexOf("</ViewportHudPortal>");
  const questPanel = nav.indexOf("Quest scroll overlay");
  assert.ok(portalEnd >= 0 && questPanel > portalEnd, "quest panels should remain on the canonical stage");
});

test("Home reward cue follows the expanded HUD instead of remaining fixed to the centered phone frame", () => {
  const topBar = read("client/src/components/TopBar.tsx");
  assert.match(topBar, /data-testid="button-gift-rewards-floating"/);
  assert.match(topBar, /className="absolute transition-transform active:scale-90"/);
  assert.doesNotMatch(topBar, /data-testid="button-gift-rewards-floating"[\s\S]{0,300}className="fixed/);
});
