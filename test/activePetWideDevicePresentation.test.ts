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
  assert.doesNotMatch(home, /top: "calc\(72\*var\(--vh\)\)"/);
  assert.match(home, /activePetGroundViewport\.y - activePetContentRect\.top/);
  assert.match(home, /activePetGroundViewport\.x - activePetContentRect\.left/);
  assert.match(home, /<ActivePetPlacement templateId=\{activePet\.petTemplateId\}/);
  assert.match(home, /data-testid="display-pet-rarity-stars"/);
  assert.match(home, /top: "8%", left: "50%"/);
  assert.match(home, /data-testid="active-pet-name-level-anchor"/);
  assert.match(home, /bottom: activePet\.isHatched/);
  assert.match(home, /data-testid="button-open-pet-actions"/);
});

test("Active Pet no longer defines an unused 844px stage baseline", () => {
  const css = readFileSync("client/src/index.css", "utf8");
  assert.doesNotMatch(css, /\.home-active-pet-stage\s*\{/);
  assert.doesNotMatch(css, /--home-active-pet-ground-y/);
});

test("Active Pet backdrop tracks its own viewport rect and loaded artwork dimensions", () => {
  assert.match(home, /ref=\{activePetBackdropRef\}/);
  assert.match(home, /image\.naturalWidth/);
  assert.match(home, /image\.naturalHeight/);
  assert.match(home, /activePetBackdropRef\.current/);
  assert.match(home, /data-artwork-width=\{activePetArtworkSize\.width \|\| undefined\}/);
  assert.match(home, /data-backdrop-width=\{activePetBackdropRect\.width \|\| undefined\}/);
  assert.match(home, /window\.visualViewport\?\.addEventListener\("resize", update\)/);
});
