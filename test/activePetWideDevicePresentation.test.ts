import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Active Pet wide devices use viewport scenery without the canonical center tint", () => {
  assert.match(home, /data-testid="active-pet-page"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
  assert.match(home, /data-testid="active-pet-canonical-ambient"/);
  assert.match(home, /className="active-pet-canonical-ambient w-full rounded-xl/);

  assert.match(
    shell,
    /#game-stage\[data-coordinate-owner="stage"\] \.active-pet-canonical-ambient \{\s*background: transparent !important;\s*\}/,
  );

  // The inline radial tint remains in HomePage for native phones; only the
  // stage-owned wide-device rule suppresses it.
  assert.match(
    home,
    /background: "radial-gradient\(ellipse at center, rgba\(45,122,79,0\.15\) 0%, transparent 70%\)"/,
  );
});

test("Active Pet authored placement and chrome remain unchanged", () => {
  assert.match(home, /ref=\{\(element\) => \{ activePetSceneRef\.current = element; \}\}/);
  assert.match(home, /top: "calc\(72\*var\(--vh\)\)"/);
  assert.match(home, /<ActivePetPlacement templateId=\{activePet\.petTemplateId\}/);
  assert.match(home, /data-testid="display-pet-rarity-stars"/);
  assert.match(home, /paddingTop: "155px"/);
  assert.match(home, /top: Math\.max\(0, activePetSceneRect\.top - 64\)/);
  assert.match(home, /left: activePetSceneRect\.left \+ activePetSceneRect\.width \/ 2/);
  assert.match(home, /marginBottom: "-52px"/);
  assert.match(home, /data-testid="active-pet-name-level-anchor"/);
  assert.match(home, /activePetSceneRect\.top \+ activePetSceneRect\.height \+ 12/);
  assert.match(home, /bottom: activePet\.isHatched/);
  assert.match(home, /data-testid="button-open-pet-actions"/);
});

test("Active Pet platform baseline remains the shared 844px authored reference", () => {
  assert.match(shell + readFileSync("client/src/index.css", "utf8"), /\.home-active-pet-stage \{[\s\S]*--home-active-pet-ground-y: 610px;[\s\S]*bottom: calc\(844px - var\(--home-active-pet-ground-y\)\)/);
});
