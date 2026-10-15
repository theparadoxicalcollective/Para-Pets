import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("tablet and desktop shell use page surroundings with cover instead of distortion", () => {
  const css = read("client/src/tabletStageShell.css");
  const app = read("client/src/App.tsx");

  assert.match(css, /--stage-surrounding-image/);
  assert.match(css, /var\(--stage-surrounding-image, var\(--desktop-stage-background-image\)\)/);
  assert.match(css, /background-position: var\(--stage-surrounding-position, center center\)/);
  assert.match(css, /background-size: cover/);
  assert.doesNotMatch(css, /background-size:\s*100% 100%/);

  // MainGameBG remains the safe fallback for pages that have not opted in yet.
  assert.match(app, /data-stage-coordinate-owner="viewport"/);
  assert.doesNotMatch(app, /--desktop-stage-background-image|MainGameBG\.png/);
});

test("surrounding hook only mutates shell presentation and restores nested parent environments", () => {
  const source = read("client/src/lib/stageSurroundings.ts");

  assert.match(source, /\.game-stage-shell:not\(\.hub-document-shell\)/);
  assert.match(source, /const surroundingEntries = new Map/);
  assert.match(source, /priorityDelta/);
  assert.match(source, /surroundingEntries\.delete\(ownerId\)/);
  assert.match(source, /applyStageSurroundings\(\)/);
  assert.match(source, /--stage-surrounding-image/);
  assert.doesNotMatch(source, /game-stage-content|data-design-width|data-design-height|transform:/);
});

test("Active Pet uses one full-device backdrop instead of a second shell-surroundings copy", () => {
  const source = read("client/src/pages/HomePage.tsx");

  assert.match(source, /ViewportBackdropPortal/);
  assert.match(source, /data-testid="active-pet-viewport-backdrop"/);
  assert.match(source, /backgroundImage: `url\(\$\{bgImg\}\)`/);
  assert.doesNotMatch(source, /useStageSurroundings/);
});

test("World surroundings follow the current world and opened location background", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(source, /useStageSurroundings/);
  assert.match(source, /showLocationView && committedLocBgUrl \? committedLocBgUrl : committedWorldBg \|\| null/);
  assert.match(source, /backgroundPosition: "center top"/);

  // The actual world canvas keeps its existing authored image-space renderer.
  assert.match(source, /backgroundImage: committedWorldBg \? `url\(\$\{committedWorldBg\}\)` : undefined/);
  assert.match(source, /backgroundSize: "100% 100%"/);
});

test("owner and visitor Pet Homes mirror the current outdoor or interior scene without moving objects", () => {
  for (const path of [
    "client/src/pages/PetHousePage.tsx",
    "client/src/pages/VisitPetHousePage.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /useStageSurroundings/);
    assert.match(source, /imageUrl: openInterior\?\.url \?\? bgUrl/);
    assert.match(source, /overlayAlpha: openInterior \? 0\.38 : 0\.22/);
  }

  const owner = read("client/src/pages/PetHousePage.tsx");
  assert.match(owner, /left = panX \+ item\.xPct \* imgWidth/);
  assert.match(owner, /top = item\.yPct \* containerH/);
});

test("mini-games temporarily override their parent world surroundings and restore it on close", () => {
  const frame = read("client/src/components/world/MiniGameFrame.tsx");
  const hook = read("client/src/lib/stageSurroundings.ts");

  assert.match(frame, /useStageSurroundings\(\{ imageUrl: artwork/);
  assert.match(frame, /priority: 20/);
  assert.match(hook, /\(b\.options\.priority \?\? 10\) - \(a\.options\.priority \?\? 10\)/);
  assert.match(hook, /return priorityDelta !== 0 \? priorityDelta : b\.sequence - a\.sequence/);
});

test("Bayou Clearing supplies its actual clearing artwork to the surrounding shell", () => {
  const source = read("client/src/pages/ElysianBayouClearingPage.tsx");
  assert.match(source, /import backgroundUrl from "@assets\/uploads\/NewClearingBg\.png"/);
  assert.match(source, /useStageSurroundings\(\{ imageUrl: backgroundUrl/);
});

test("context-aware surroundings never change the iPhone 12 stage geometry contract", () => {
  const stage = read("client/src/lib/stage.ts");
  const surroundings = read("client/src/lib/stageSurroundings.ts");

  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /if \(Math\.round\(viewportWidth\) === DESIGN_W\) return false/);
  assert.doesNotMatch(surroundings, /calculateStageLayout|shouldFitPortraitReference|getStageTransform/);
});
