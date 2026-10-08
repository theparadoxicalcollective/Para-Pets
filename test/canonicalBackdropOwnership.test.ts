import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const home = read("client/src/pages/HomePage.tsx");
const power = read("client/src/components/PetPowerUpPage.tsx");
const backdrop = read("client/src/components/ViewportBackdropPortal.tsx");
const shell = read("client/src/tabletStageShell.css");

test("Active Pet scenery has one viewport backdrop owner on stage-owned devices", () => {
  assert.match(home, /data-testid="active-pet-page"[\s\S]{0,120}data-viewport-visual-owner="backdrop"/);
  assert.match(home, /<ViewportBackdropPortal(?:\s+targetId="game-viewport-page")?>[\s\S]*data-testid="active-pet-viewport-backdrop"/);
  assert.equal((home.match(/backgroundImage: `url\(\$\{bgImg\}\)`/g) ?? []).length, 1);
  assert.match(backdrop, /if \(!target\) return stageOwned \? null : <>\{children\}<\/>/);
});

test("Power Up does not repaint its full canonical background over the viewport backdrop", () => {
  assert.match(power, /className="pupage"[\s\S]{0,180}data-viewport-visual-owner="backdrop"/);
  assert.match(power, /data-testid="power-up-viewport-backdrop"/);
  assert.match(power, /className="pupage-bg" data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(power, /className="pupage-vignette" data-canonical-visual-layer="duplicate-backdrop"/);
  assert.match(shell, /\[data-canonical-visual-layer="duplicate-backdrop"\][\s\S]*display: none !important/);
});

test("native phone rendering keeps the canonical fallback path", () => {
  assert.match(backdrop, /stageOwned: stage\?\.dataset\.coordinateOwner === "stage"/);
  assert.match(backdrop, /stageOwned \? null : <>\{children\}<\/>/);
  assert.match(power, /<img src=\{pupBackground\} alt="" className="pupage-bg"/);
});
