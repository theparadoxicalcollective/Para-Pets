import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const loading = readFileSync("client/src/components/LoadingScreen.tsx", "utf8");
const aquarium = readFileSync("client/src/pages/AquariumPage.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");

test("GameStage has one explicit back-to-front viewport ownership stack", () => {
  const backdrop = app.indexOf('id="game-viewport-backdrop"');
  const content = app.indexOf('id="game-stage-content"');
  const page = app.indexOf('id="game-viewport-page"');
  const scene = app.indexOf('id="game-viewport-scene"');
  const hud = app.indexOf('id="game-viewport-hud"', page);
  assert.ok(backdrop >= 0 && content >= 0 && page >= 0 && scene >= 0 && hud >= 0);
  assert.match(app.slice(page, page + 900), /zIndex: 20/);
  // The full-device backdrop must cover stale canonical-stage scenery without intercepting page input.
  assert.match(app.slice(backdrop, backdrop + 700), /zIndex: 17/);
  assert.match(app.slice(backdrop, backdrop + 700), /pointerEvents: "none"/);
  assert.match(app.slice(content, content + 500), /zIndex: 15/);
  assert.match(app.slice(scene, scene + 500), /zIndex: 30/);
  assert.match(app.slice(hud, hud + 600), /zIndex: 40/);
});

test("stage route surface no longer paints a generic layer over page-owned scenery", () => {
  assert.doesNotMatch(surface, /stage-page-viewport-visual/);
  assert.match(surface, /data-stage-reference-plane="true"/);
  assert.match(surface, /createPortal\(content, target\)/);
});

test("LoadingScreen is attached to document.body, outside the transformed stage", () => {
  assert.match(loading, /import \{ createPortal \} from "react-dom"/);
  assert.match(loading, /data-testid="global-loading-screen"/);
  assert.match(loading, /createPortal\(screen, document\.body\)/);
});

test("Aquarium owns its background in the same top viewport layer as its content", () => {
  assert.doesNotMatch(aquarium, /ViewportBackdropPortal/);
  assert.match(aquarium, /data-testid="aquarium-viewport-backdrop"/);
  assert.match(aquarium, /className="absolute inset-0 overflow-hidden"/);
  assert.match(aquarium, /data-testid="aquarium-page"/);
});

test("old Aquarium descendant visibility hack is gone", () => {
  assert.doesNotMatch(css, /#game-stage-content:has\(\[data-testid="aquarium-page"\]\)/);
  assert.doesNotMatch(css, /stage-page-viewport-visual/);
});
