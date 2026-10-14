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

test("floating navigation retains menu and tutorial controls", () => {
  assert.match(nav, /<ViewportHudPortal>/);
  assert.match(nav, /para-pets:pet-menu-open/);
  assert.match(nav, /showLoginHint/);
  assert.match(nav, /spacing \* 2/);
  assert.match(nav, /NAV_RIGHT \+ BUTTON_SIZE \/ 2 \+ spacing \* 2 - 22/);
});
