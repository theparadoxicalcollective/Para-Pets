import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const petWorld = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");
const modalPortal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

test("ordinary Active Pet speed-up sheet retains viewport modal ownership", () => {
  const start = home.indexOf('data-testid="active-pet-speedup-viewport-modal"');
  assert.ok(start >= 0);
  const section = home.slice(Math.max(0, start - 160), home.indexOf("Screen-relative Pet Menu", start));
  assert.match(section, /<ViewportModalPortal>[\s\S]*data-testid="active-pet-speedup-viewport-modal"/);
  assert.match(section, /showSpeedUp && activePet && !activePet\.isHatched/);
  assert.match(section, /ref=\{homeEggDropRef\}/);
  assert.doesNotMatch(section, /data-bj=|isBeginJourneyStep5|bjIsStep5|tutorialFill/);
  assert.doesNotMatch(section, /maxWidth: "768px"|className="fixed inset-0/);
});

test("Active Pet hatch reveal can cover the real viewport without changing reveal content", () => {
  const marker = 'data-testid="active-pet-hatch-reveal-viewport-modal"';
  const markerIndex = home.indexOf(marker);
  assert.ok(markerIndex >= 0);
  const start = home.lastIndexOf("hatchRevealing &&", markerIndex);
  const end = home.indexOf("Veridian Watcher + Support", markerIndex);
  const section = home.slice(start, end);

  assert.match(section, /<ViewportModalPortal>/);
  assert.match(section, /data-testid="active-pet-hatch-reveal-viewport-modal"/);
  assert.doesNotMatch(section, /maxWidth: "768px"|className="fixed inset-0/);
  assert.match(section, /data-testid="text-hatch-reveal"/);
  assert.match(section, /hatchedPetCache\.hatchedImageUrl \|\| hatchedPetCache\.imageUrl/);
});

test("Pet World pet detail backdrop uses the shared viewport modal layer", () => {
  const start = petWorld.indexOf('data-testid="pet-world-pet-detail-viewport-modal"');
  assert.ok(start >= 0);
  const end = petWorld.indexOf("\nfunction ", start);
  const section = petWorld.slice(start, end);

  assert.match(petWorld.slice(Math.max(0, start - 100), start), /<ViewportModalPortal>/);
  assert.doesNotMatch(section, /maxWidth: "768px"|className="fixed inset-0/);
  assert.match(section, /data-testid="button-close-pet-detail"/);
  assert.match(section, /<\/ViewportModalPortal>/);
});

test("shared viewport modal portal retains native phone fallback", () => {
  assert.match(modalPortal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});
