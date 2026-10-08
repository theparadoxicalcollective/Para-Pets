import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("stage-owned devices expose a full-device backdrop behind canonical content", () => {
  const app = read("client/src/App.tsx");

  const backdrop = app.indexOf('id="game-viewport-backdrop"');
  const content = app.indexOf('id="game-stage-content"', backdrop);
  const scene = app.indexOf('id="game-viewport-scene"', content);
  const hud = app.indexOf('id="game-viewport-hud"', scene);

  assert.ok(backdrop >= 0);
  assert.ok(content > backdrop);
  assert.ok(scene > content);
  assert.ok(hud > scene);

  const backdropBlock = app.slice(backdrop, content);
  assert.match(backdropBlock, /left: 0/);
  assert.match(backdropBlock, /top: 0/);
  assert.match(backdropBlock, /width: "100%"/);
  assert.match(backdropBlock, /height: "100%"/);
  assert.match(backdropBlock, /pointerEvents: "none"/);
});

test("Active Pet background uses the backdrop portal while presentation stays on the canonical stage", () => {
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(home, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(home, /<ViewportBackdropPortal(?:\s+targetId="game-viewport-page")?>/);
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
  assert.match(home, /className="active-pet-viewport-backdrop absolute inset-0 overflow-hidden"/);
  assert.match(home, /backgroundImage: `url\(\$\{bgImg\}\)`/);
  assert.match(home, /backgroundPosition: "center top"/);
  assert.doesNotMatch(home, /useStageSurroundings/);

  const pageStart = home.indexOf('data-testid="active-pet-page"');
  const backdropStart = home.indexOf('<ViewportBackdropPortal targetId="game-viewport-page">', pageStart);
  const backdropEnd = home.indexOf("</ViewportBackdropPortal>", backdropStart);
  const stars = home.indexOf('data-testid="display-pet-rarity-stars"', backdropEnd);
  const pet = home.indexOf('data-testid="display-active-pet"', backdropEnd);
  const chrome = home.indexOf('data-testid="active-pet-name-level-anchor"', backdropEnd);

  assert.ok(pageStart >= 0);
  assert.ok(backdropStart > pageStart && backdropEnd > backdropStart);
  assert.ok(stars > backdropEnd);
  assert.ok(pet > backdropEnd);
  assert.ok(chrome > backdropEnd);
});

test("native phone fallback keeps backdrop children inline", () => {
  const portal = read("client/src/components/ViewportBackdropPortal.tsx");

  assert.match(portal, /const VIEWPORT_BACKDROP_ID = "game-viewport-backdrop"/);
  assert.match(portal, /stageOwned: stage\?\.dataset\.coordinateOwner === "stage"/);
  assert.match(portal, /if \(!enabled\) return <>\{children\}<\/>/);
  assert.match(portal, /if \(!target\) return stageOwned \? null : <>\{children\}<\/>/);
  assert.match(portal, /stage\.dataset\.viewportBackdropActive = "true"/);
  assert.match(portal, /shell\.dataset\.viewportBackdropActive = "true"/);
});

test("expanded scene and backdrop ownership suppress duplicate shell artwork without phone-frame chrome", () => {
  const scenePortal = read("client/src/components/ViewportScenePortal.tsx");
  const css = read("client/src/tabletStageShell.css");

  assert.match(scenePortal, /shell\.dataset\.viewportSceneActive = "true"/);
  assert.match(css, /\.game-stage-shell\[data-viewport-scene-active="true"\]/);
  assert.match(css, /\.game-stage-shell\[data-viewport-backdrop-active="true"\]/);
  assert.match(css, /background-image: none !important/);

  assert.doesNotMatch(css, /outline:/);
  assert.doesNotMatch(css, /border-radius:/);
  assert.doesNotMatch(css, /box-shadow:/);
  assert.doesNotMatch(css, /#game-stage\[data-viewport-(?:scene|backdrop)-active/);
});

test("tablet Active Pet backdrop uses one continuous cover composition instead of a framed phone copy", () => {
  const css = read("client/src/tabletStageShell.css");

  assert.match(css, /#game-stage\[data-coordinate-owner="stage"\] \.active-pet-viewport-backdrop/);
  assert.match(css, /background-position: center center !important/);
});
