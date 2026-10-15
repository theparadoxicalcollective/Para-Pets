import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("Level Up no longer needs a legacy scene-portal stacking exception", () => {
  assert.equal(usesDeviceGameplaySurface("/pet-level-up/pet-1"), true);
  assert.doesNotMatch(app, /data-level-up-route/);
  assert.doesNotMatch(css, /data-level-up-route/);
  const device = app.slice(app.indexOf("if (usesDeviceGameplaySurface(location))"), app.indexOf("// Public entry and authentication"));
  assert.match(device, /id="game-viewport-scene"/);
  assert.match(device, /id="game-viewport-scene"[\s\S]*zIndex: 30/);
  assert.match(device, /id="game-stage-content"[\s\S]*zIndex: 15/);
  assert.match(device, /id="game-viewport-hud"[\s\S]*zIndex: 40/);
});

test("Level Up owns its background locally and keeps the original oval", () => {
  assert.match(app, /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,120}<StagePageSurface key=\{location\} layout="viewport">/);
  assert.match(level, /\{deviceSurface \? \(/);
  assert.match(level, /<PetPageOvalPlacement page="levelUp"/);
});
