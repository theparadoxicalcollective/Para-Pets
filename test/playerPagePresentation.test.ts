import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getPlayerRoutePresentation,
  isIsolatedPlayerRoute,
  shouldHideFloatingNav,
} from "../client/src/lib/playerPagePresentation";

const read = (path: string) => readFileSync(path, "utf8");

test("player route presentation keeps Home, stage pages, and isolated pages explicit", () => {
  assert.equal(getPlayerRoutePresentation("/"), "home");
  for (const path of ["/map", "/world/swamp", "/pet-house", "/equip-accessories", "/pet-care/pet-1", "/coins"]) {
    assert.equal(getPlayerRoutePresentation(path), "stage", path);
  }
  for (const path of ["/auth", "/privacy", "/hub", "/forum", "/founders", "/admin", "/visit/user-1", "/pet-level-up/pet-1", "/reset-password/token"]) {
    assert.equal(getPlayerRoutePresentation(path), "isolated", path);
    assert.equal(isIsolatedPlayerRoute(path), true, path);
  }
});

test("navigation ownership preserves the existing blocking player routes", () => {
  for (const path of ["/equip-accessories", "/equip-accessories/pet-1", "/pet-care/pet-1", "/pvp", "/coins", "/bag", "/games/molten-blocks", "/games/lava-crawl"]) {
    assert.equal(shouldHideFloatingNav(path), true, path);
  }
  for (const path of ["/", "/map", "/world/swamp", "/pet-house", "/friends", "/market"]) {
    assert.equal(shouldHideFloatingNav(path), false, path);
  }
});

test("all GameStage overlay routes use one canonical stage-page root", () => {
  const app = read("client/src/App.tsx");
  const surface = read("client/src/components/StagePageSurface.tsx");

  assert.match(app, /import StagePageSurface from "@\/components\/StagePageSurface"/);
  assert.match(app, /isIsolatedPlayerRoute\(location\)/);
  assert.match(app, /shouldHideFloatingNav\(location\)/);
  assert.doesNotMatch(app, /const NAV_HIDDEN_PATHS/);
  assert.doesNotMatch(app, /className="page-overlay" style=\{\{ position: "absolute", inset: 0 \}\}/);
  assert.ok((app.match(/<StagePageSurface/g) ?? []).length >= 10);

  assert.match(surface, /data-page-presentation=\{target \? "viewport" : "stage"\}/);
  assert.match(surface, /const VIEWPORT_PAGE_ID = "game-viewport-page"/);
  assert.match(surface, /data-stage-reference-plane="true"/);
  assert.match(surface, /return target \? createPortal\(content, target\) : content/);
  assert.match(surface, /position: "absolute"/);
  assert.match(surface, /inset: 0/);
  assert.match(surface, /width: "100%"/);
  assert.match(surface, /height: "100%"/);
});

test("Haunted Woods welcome uses the viewport modal layer instead of a stage-fixed dialog", () => {
  const app = read("client/src/App.tsx");
  const start = app.indexOf('{screenDone && worldId === "haunted_woods" && showHauntedWelcome');
  const end = app.indexOf("\n      )}", start);
  const block = app.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(block, /<ViewportModalPortal>/);
  assert.match(block, /className="absolute inset-0 flex items-center justify-center px-5"/);
  assert.doesNotMatch(block, /className="fixed inset-0 z-\[90\]/);
  assert.match(block, /aria-modal="true"/);
});
