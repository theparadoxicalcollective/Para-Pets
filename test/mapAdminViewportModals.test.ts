import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");
const portal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

test("map admin blocking dialogs use the shared viewport modal layer", () => {
  assert.match(map, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.equal((map.match(/<ViewportModalPortal>/g) ?? []).length, 3);
  assert.equal((map.match(/<\/ViewportModalPortal>/g) ?? []).length, 3);
  assert.match(map, /data-testid="map-add-world-viewport-modal"/);
  assert.match(map, /data-testid="map-edit-world-viewport-modal"/);
  assert.match(map, /data-testid="map-background-viewport-modal"/);
  assert.doesNotMatch(map, /fixed inset-0 z-50 flex items-center justify-center" style=\{\{ maxWidth: "768px"/);
});

test("map admin dialog controls and mutations stay intact", () => {
  assert.match(map, /data-testid="modal-add-world"/);
  assert.match(map, /data-testid="button-close-add-world"/);
  assert.match(map, /createWorldMutation\.mutate/);
  assert.match(map, /data-testid="modal-edit-world"/);
  assert.match(map, /data-testid="button-close-edit-world"/);
  assert.match(map, /editWorldMutation\.mutate/);
  assert.match(map, /data-testid="modal-edit-map-bg"/);
  assert.match(map, /data-testid="button-close-map-bg"/);
});

test("shared modal portal retains native fallback and viewport HUD ownership", () => {
  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
  assert.match(portal, /VIEWPORT_HUD_ID/);
});
