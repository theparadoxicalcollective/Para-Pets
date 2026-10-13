import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Pet Care explicitly selects device ownership or embedded coordinate ownership", () => {
  assert.match(care, /<ViewportScenePortal interactive=\{false\}>[\s\S]*data-testid="pet-care-viewport-environment"/);
  assert.match(care, /data-testid="overlay-feeding"/);
  assert.match(care, /data-stage-coordinate-space=\{deviceSurface \|\| viewportCareSurface\(\) \? "viewport" : "canonical"\}/);
  assert.match(care, /data-viewport-visual-owner="scene"/);
  assert.match(care, /data-testid="drop-zone-feed-pet"/);
  assert.ok(care.includes('data-testid={\`pet-care-\${kind}-shelf\`}'));
  assert.ok(care.includes('kind: "edibles" | "gifts";'));
});

test("stage-owned tablets and desktop move only Pet Care edge controls to the physical camera", () => {
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-testid="overlay-feeding"\] \{[\s\S]*overflow: visible !important/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-testid="overlay-feeding"\] \.pet-care-header[\s\S]*--viewport-surface-left[\s\S]*--viewport-surface-right/);
  assert.match(care, /className="absolute top-0 left-0 right-0 flex items-center justify-end gap-2 px-4 pt-4 pet-care-header"/);
  assert.match(care, /data-testid="button-care-help"/);
  assert.match(care, /data-testid="button-close-feeding"/);
});

test("Pet Care interaction and reward behavior is not rewritten by the presentation change", () => {
  assert.match(care, /pointInsideExpandedPetDropZone/);
  assert.match(care, /PET_CARE_DROP_PADDING_PX/);
  assert.match(care, /const feedbackSurface = \(\) => overlayRef\.current/);
  assert.match(care, /clientPointInRenderedElement\(surface\.getBoundingClientRect\(\), x, y, surface\.clientWidth, surface\.clientHeight\)/);
  assert.doesNotMatch(care, /\bclientToStage\(x, y\)/);
  assert.match(care, /apiRequest\("POST", `\/api\/pets\/\$\{inventoryId\}\/petting-reward`/);
  assert.match(care, /apiRequest\("POST", `\/api\/pet\/\$\{pet\.inventoryId\}\/give-gift`/);
  assert.match(care, /apiRequest\("POST", `\/api\/pet\/\$\{pet\.inventoryId\}\/claim-loyalty-reward`/);
});

test("native phone presentation remains outside the larger-device override", () => {
  assert.doesNotMatch(shell, /#game-stage\[data-coordinate-owner="viewport"\][\s\S]*pet-care-header/);
});
