import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("floating navigation measures its real viewport HUD container", () => {
  assert.match(nav, /getElementById\("game-viewport-hud"\)/);
  assert.match(nav, /getBoundingClientRect\(\)\.width/);
  assert.match(nav, /ResizeObserver\(measure\)/);
  assert.match(nav, /observer\?\.disconnect\(\)/);
  assert.doesNotMatch(nav, /getStageSurface|DESIGN_W|DESIGN_H/);
});

test("floating navigation retains menu controls without obsolete tutorial pointers", () => {
  assert.match(nav, /<ViewportHudPortal>/);
  assert.match(nav, /para-pets:pet-menu-open/);
  assert.doesNotMatch(nav, /showLoginHint|tutorialArrow|bjSetStep|BEGIN_JOURNEY_ENABLED/);
  assert.match(nav, /data-testid="button-floating-nav"/);
});
