import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("client/src/App.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const levelRoute = readFileSync("client/src/pages/PetLevelUpRoute.tsx", "utf8");
const levelPage = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("tablet background paints over stale reference-stage scenery but below the interactive page", () => {
  const page = app.indexOf('id="game-viewport-page"');
  const backdrop = app.indexOf('id="game-viewport-backdrop"');
  const reference = app.indexOf('id="game-stage-content"', backdrop);
  assert.ok(page >= 0 && backdrop >= 0 && reference > backdrop);
  assert.match(app.slice(page, page + 180), /zIndex: 20/);
  assert.match(app.slice(backdrop, reference), /zIndex: 17/);
  assert.match(app.slice(backdrop, reference), /pointerEvents: "none"/);
  assert.match(app.slice(reference, reference + 370), /zIndex: 15/);
});

test("Pet Menu does not overlap full-screen Power-Up while its quest controls remain", () => {
  assert.match(home, /!isOverlayActive && !showProfile && !showPetStats && !showSupportModal && !showWorldChat && activePetModal === null && activePetForModal && \(/);
  assert.match(home, /data-testid="button-open-pet-menu"/);
  assert.match(home, /data-testid="button-action-power-up"/);
  assert.match(home, /data-testid="button-action-level-up"/);
});

test("isolated Level Up has an explicit touch-enabled viewport covering the tablet", () => {
  assert.match(levelRoute, /data-testid="pet-level-up-isolated-surface"/);
  assert.match(levelRoute, /position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1000, pointerEvents: "auto", touchAction: "pan-y"/);
  assert.match(levelPage, /data-testid="button-close-levelup-modal"/);
  assert.match(levelPage, /onClick=\{onClose\}/);
  assert.match(levelPage, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(levelPage, /onPointerUp=\{onPointerUp\}/);
});
