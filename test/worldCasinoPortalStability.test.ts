import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("world scene portal stays mounted while Casino and other overlays open", () => {
  const source = fs.readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  assert.match(source, /<ViewportScenePortal>/);
  assert.doesNotMatch(source, /<ViewportScenePortal enabled=\{!worldMapCameraBlocked\}>/);
  assert.match(source, /onOverlayVisibilityChange=\{setWorldLocationOverlayOpen\}/);
  assert.match(source, /worldLocationOverlayOpen/);
  assert.match(source, /!worldMapCameraBlocked && \(/);
});

test("Casino remains owned by WorldLocations, with admin select-before-open preserved", () => {
  const source = fs.readFileSync("client/src/components/world/WorldLocations.tsx", "utf8");
  assert.match(source, /const \[casinoScene, setCasinoScene\] = useState/);
  assert.match(source, /if \(isAdmin && selectedLocId !== loc\.id\)/);
  assert.match(source, /setCasinoScene\(loc\)/);
  assert.match(source, /onOverlayVisibilityChange\?\.\(casinoScene !== null\)/);
});
