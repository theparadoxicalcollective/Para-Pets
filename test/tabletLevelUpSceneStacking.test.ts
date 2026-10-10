import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("tablet Level Up interactive surface paints above scene portal", () => {
  assert.match(app, /id="game-viewport-page"[\s\S]{0,150}data-level-up-route=\{location\.startsWith\("\/pet-level-up\/"\)/);
  assert.match(app, /id="game-viewport-scene"[\s\S]{0,400}zIndex: 30/);
  assert.match(css, /#game-stage\[data-coordinate-owner="stage"\] #game-viewport-page\[data-level-up-route="true"\]\s*\{\s*z-index: 35 !important/);
});

test("the layering change is scoped and keeps the original Level Up oval", () => {
  assert.match(app, /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,120}<StagePageSurface key=\{location\} layout="viewport">/);
  assert.match(level, /<PetPageOvalPlacement page="levelUp"/);
  assert.doesNotMatch(css, /#game-viewport-page\s*\{\s*z-index: 35/);
});
