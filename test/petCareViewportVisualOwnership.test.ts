import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Pet Care lets the viewport scene own wide-device room artwork", () => {
  assert.match(care, /<ViewportScenePortal interactive=\{false\}>[\s\S]*data-testid="pet-care-viewport-environment"/);
  assert.match(care, /data-stage-coordinate-space=\{viewportCareSurface\(\) \? "viewport" : "canonical"\}[\s\S]*data-viewport-visual-owner="scene"/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-viewport-visual-owner="scene"\] \{[\s\S]*background-color: transparent !important;[\s\S]*background-image: none !important;/);

  // Native phones retain the existing inline room treatment because the
  // transparency rule only applies when the stage owns coordinates.
  assert.match(care, /backgroundColor: "#0c1a10"/);
  assert.match(care, /backgroundImage: `linear-gradient\(180deg,[\s\S]*feedingPageBg/);
});

test("Pet Care gameplay uses actual element geometry for drag and touch", () => {
  assert.match(care, /ref=\{overlayRef\}/);
  assert.match(care, /data-testid="overlay-feeding"/);
  assert.match(care, /data-pet-care-inventory-jar="true"/);
  assert.match(care, /data-testid="button-close-feeding"/);
  assert.match(care, /getBoundingClientRect\(\)/);
  assert.match(care, /event\.clientX - rect\.left/);
  assert.match(care, /event\.clientY - rect\.top/);
  assert.match(care, /pointInsideExpandedPetDropZone/);
});

test("Pet Care server mutations and live inventory behavior are untouched", () => {
  assert.match(care, /queryKey: \["\/api\/inventory"\]/);
  assert.match(care, /refetchInterval: 30_000/);
  assert.match(care, /`\/api\/pet\/\$\{pet\.inventoryId\}\/feed-edible`/);
  assert.match(care, /`\/api\/pet\/\$\{pet\.inventoryId\}\/give-gift`/);
});
