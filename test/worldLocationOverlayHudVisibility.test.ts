import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("world map HUD hides when a location-owned foreground overlay opens", () => {
  const page = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  const locations = readFileSync("client/src/components/world/WorldLocations.tsx", "utf8");
  assert.match(page, /worldLocationOverlayOpen\s*\|\|\s*showLocationView/);
  assert.match(page, /\{!worldMapCameraBlocked && \(\s*<ViewportHudPortal>/);
  assert.match(page, /onOverlayVisibilityChange=\{setWorldLocationOverlayOpen\}/);
  assert.match(locations, /onOverlayVisibilityChange\?\.\(casinoScene !== null\)/);
  assert.match(locations, /onOverlayVisibilityChange\?\.\(false\)/);
});
