import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const portal = readFileSync("client/src/components/ViewportBackdropPortal.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const stage = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");

test("Active Pet background belongs to the same viewport host as the pet page", () => {
  const start = home.indexOf('data-testid="active-pet-page"');
  const backdrop = home.indexOf('<ViewportBackdropPortal targetId="game-viewport-page">', start);
  const art = home.indexOf('data-testid="active-pet-viewport-backdrop"', backdrop);
  assert.ok(start >= 0 && backdrop > start && art > backdrop);
  assert.match(home.slice(art, art + 350), /backgroundImage: `url\(\$\{bgImg\}\)`/);
  assert.match(stage, /data-testid="stage-page-reference-plane"/);
});

test("page-owned artwork paints behind pet controls but above stale canonical stage", () => {
  assert.match(portal, /targetId = VIEWPORT_BACKDROP_ID/);
  assert.match(portal, /document\.getElementById\(targetId\)/);
  assert.match(portal, /targetId === "game-viewport-page" \? 0 : undefined/);
  assert.match(css, /#game-viewport-page > \[data-testid="stage-page-surface"\] \{\s*z-index: 1/);
  assert.match(css, /#game-viewport-page > \[data-testid="viewport-backdrop-portal"\] \{\s*z-index: 0/);
});

test("native phone fallback and existing saved pet placement remain untouched", () => {
  assert.match(portal, /if \(!target\) return stageOwned \? null : <>\{children\}<\/>/);
  assert.match(home, /data-testid="display-active-pet"/);
  assert.match(home, /data-testid="active-pet-canonical-ambient"/);
});
