import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("client/src/App.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const rewardCss = readFileSync("client/src/activePetRewardAssets.css", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

test("Active Pet uses native viewport artwork without the scaled root shell", () => {
  assert.match(app, /data-stage-coordinate-owner="viewport"/);
  assert.match(app, /id="game-viewport-page"/);
  assert.doesNotMatch(app, /expandedStage|--active-pet-background-image/);
  assert.match(home, /active-pet-viewport-backdrop/);
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
