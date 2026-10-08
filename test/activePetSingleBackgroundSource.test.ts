import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("client/src/App.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("stage-owned Active Pet paints one device-wide artwork, not the phone inset", () => {
  assert.match(app, /data-active-pet-route=\{location === "\/" \? "true" : undefined\}/);
  assert.match(app, /data-stage-coordinate-owner=\{layout\.coordinateOwner\}/);
  assert.doesNotMatch(app, /--active-pet-background-image/);
  assert.match(css, /\.game-stage-shell\[data-active-pet-route="true"\]\[data-stage-coordinate-owner="stage"\]/);
  assert.match(css, /background-image: none !important/);
  assert.match(css, /#game-viewport-page > \[data-testid="viewport-backdrop-portal"\] \{\s*display: block !important/);
});

test("native phone keeps original inline background and pet placement", () => {
  assert.match(home, /<ViewportBackdropPortal targetId="game-viewport-page">/);
  assert.match(home, /data-testid="display-active-pet"/);
  assert.match(home, /data-testid="active-pet-canonical-ambient"/);
  assert.doesNotMatch(css, /\[data-stage-coordinate-owner="viewport"\][\s\S]*active-pet-viewport-backdrop/);
});
