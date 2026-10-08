import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("client/src/App.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const rewardCss = readFileSync("client/src/activePetRewardAssets.css", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

test("stage-owned Active Pet paints one device-wide artwork, not the phone inset", () => {
  assert.match(app, /data-active-pet-route=\{location === "\/" \? "true" : undefined\}/);
  assert.match(app, /data-stage-coordinate-owner=\{layout\.coordinateOwner\}/);
  assert.doesNotMatch(app, /--active-pet-background-image/);
  assert.match(css, /\.game-stage-shell\[data-active-pet-route="true"\]\[data-stage-coordinate-owner="stage"\]/);
  assert.match(css, /\.game-stage-shell\[data-active-pet-route="true"\]\[data-stage-coordinate-owner="stage"\] \{\s*background-color: #050c08 !important;\s*background-image: none !important;/);
  assert.match(css, /#game-viewport-page > \[data-testid="viewport-backdrop-portal"\] \{\s*display: block !important/);
});

test("native phone keeps original inline background and pet placement", () => {
  assert.match(home, /<ViewportBackdropPortal targetId="game-viewport-page">/);
  assert.match(home, /data-testid="display-active-pet"/);
  assert.match(home, /data-testid="active-pet-canonical-ambient"/);
  assert.doesNotMatch(css, /\[data-stage-coordinate-owner="viewport"\][\s\S]*active-pet-viewport-backdrop/);
});

test("removed ActivePetBG.png cannot repaint a phone-sized rectangle over the Active Pet", () => {
  assert.doesNotMatch(rewardCss, /ActivePetBG\.png/);
  assert.doesNotMatch(rewardCss, /\.h-screen-frame:has\(\[data-testid="display-active-pet"\]\)\s*\{\s*background-image/);
  assert.match(main, /import "\.\/activePetRewardAssets\.css"/);
  assert.match(home, /backgroundImage: `url\(\$\{bgImg\}\)`/);
});
