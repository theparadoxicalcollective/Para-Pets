import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Pet Home tutorial progress is durable, versioned, and authenticated", () => {
  const boot = fs.readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
  const route = fs.readFileSync("server/routes/petHomeTutorial.routes.ts", "utf8");
  const routes = fs.readFileSync("server/routes.ts", "utf8");

  assert.match(boot, /CREATE TABLE IF NOT EXISTS pet_home_tutorial_progress/);
  assert.match(boot, /tutorial_version integer NOT NULL DEFAULT 0/);
  assert.match(route, /PET_HOME_TUTORIAL_VERSION = 1/);
  assert.match(route, /app\.get\("\/api\/pet-home\/tutorial", isAuthenticated/);
  assert.match(route, /app\.post\("\/api\/pet-home\/tutorial\/complete", isAuthenticated/);
  assert.match(route, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(routes, /registerPetHomeTutorialRoutes\(app, \{ db, isAuthenticated \}\)/);
});

test("Pet Home tutorial follows the requested six-step guide and blocks the scene", () => {
  const overlay = fs.readFileSync("client/src/components/PetHomeTutorialOverlay.tsx", "utf8");

  for (const copy of [
    "Welcome to Your Pet Home!",
    "Day & Night",
    "Drag and drop pets, Decor, and Objects",
    "Choose Your Home",
    "Your Mailbox",
    "Tap your home to discover and explore more",
  ]) {
    assert.ok(overlay.includes(copy), copy);
  }

  assert.match(overlay, /button-home-day-night-toggle/);
  assert.match(overlay, /button-pets-inventory/);
  assert.match(overlay, /button-decor-inventory/);
  assert.match(overlay, /button-home-inventory/);
  assert.match(overlay, /data-home-building-kind="mailbox"/);
  assert.match(overlay, /data-home-tutorial-building="primary"/);
  assert.match(overlay, /button-pet-home-tutorial-continue/);
  assert.match(overlay, /event\.preventDefault\(\)/);
  assert.match(overlay, /event\.stopPropagation\(\)/);
  assert.match(overlay, /pointerEvents: "auto"/);
  assert.match(overlay, /step === "mailbox" \|\| step === "building"/);
  assert.match(overlay, /revealHomeScene \? "rgba\(0,0,0,0\)" : "rgba\(0,0,0,0\.62\)"/);
});

test("Pet Home starts the guide only after the scene is ready and exposes stable targets", () => {
  const page = fs.readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

  assert.match(page, /queryKey: \["\/api\/pet-home\/tutorial"\]/);
  assert.match(page, /petHomeTutorialStatus\?\.completed/);
  assert.match(page, /imgWidth <= 0/);
  assert.match(page, /setPetHomeTutorialStep\("welcome"\)/);
  assert.match(page, /data-home-building-kind=\{isMailbox \? "mailbox" : "building"\}/);
  assert.match(page, /data-home-tutorial-building=\{isTutorialPrimary \? "primary" : undefined\}/);
  assert.doesNotMatch(page, /containerWidth \/ 2 - \(building\.posX \/ 100\) \* imgWidth/);
  assert.match(page, /<PetHomeTutorialOverlay/);
  assert.match(page, /const tutorialSceneRevealActive = petHomeTutorialStep === "mailbox" \|\| petHomeTutorialStep === "building"/);
  assert.match(page, /darkness=\{tutorialSceneRevealActive \? 0 : outdoorLighting\.darkness\}/);
  assert.match(page, /nightStrength=\{tutorialSceneRevealActive \? 0 : outdoorLighting\.nightStrength\}/);
});


test("Pet Home tutorial follows the authoritative game stage across phones tablets and desktop", () => {
  const overlay = fs.readFileSync("client/src/components/PetHomeTutorialOverlay.tsx", "utf8");
  const page = fs.readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

  // Targets are still measured from the live rendered controls, then converted
  // from client pixels into the same logical stage used by gameplay input.
  assert.match(page, /data-testid="pet-home-stage"/);
  assert.match(overlay, /getStageSurface/);
  assert.match(overlay, /getBoundingClientRect\(\)/);
  assert.match(overlay, /\(rect\.left - surface\.left\) \/ surface\.scale/);
  assert.match(overlay, /rect\.width \/ surface\.scale/);
  assert.match(overlay, /width: surface\.logicalWidth/);
  assert.match(overlay, /height: surface\.logicalHeight/);

  // The guide no longer owns a second browser/device sizing policy. Safari,
  // Android, tablets, and desktop all inherit the shared stage controller.
  assert.doesNotMatch(overlay, /window\.visualViewport/);
  assert.doesNotMatch(overlay, /window\.innerWidth|window\.innerHeight/);
  assert.doesNotMatch(overlay, /HOME_FIXED_VIEWPORT_STYLE/);
  assert.match(overlay, /window\.addEventListener\("resize"/);
  assert.match(overlay, /window\.addEventListener\("orientationchange"/);
  assert.match(overlay, /ResizeObserver/);
  assert.match(overlay, /HOME_TOUCH_SURFACE_STYLE/);

  // Scaled portrait devices use logical stage coordinates. The iPhone 12
  // remains scale 1, so these same values preserve its existing composition.
  assert.match(overlay, /left: 0/);
  assert.match(overlay, /top: 0/);
  assert.match(overlay, /width: layout\.width/);
  assert.match(overlay, /height: layout\.height/);
  assert.match(overlay, /maxHeight: Math\.max\(160, layout\.height - 28\)/);

  // PC keyboard users cannot tab out of the modal and mobile keeps a full-size
  // Continue touch target while the underlying Home remains blocked.
  assert.match(overlay, /event\.key === "Tab" \|\| event\.key === "Escape"/);
  assert.match(overlay, /button-pet-home-tutorial-continue/);
  assert.match(overlay, /minHeight: 44/);
  assert.doesNotMatch(overlay, /navigator\.userAgent|Android|iPhone|iPad|Chrome|Safari/);
});

test("Pet House does not retain unreachable Care popup or legacy phone-stage coordinate imports", () => {
  const page = fs.readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const app = fs.readFileSync("client/src/App.tsx", "utf8");

  // The old decorative CarePopup was never mounted. Its fixed particles
  // and stage conversion therefore do not belong in active Pet House code.
  assert.doesNotMatch(page, /CarePopup|CareSparkle|careWreathImg|ring-sparkle/);
  assert.doesNotMatch(page, /from "@\/lib\/stage"|clientToStage|clientDeltaToStage|getStageScale|DESIGN_H/);

  // Retain current viewport-based Pet House interactions, tutorial and the
  // separate Pet Care gameplay route instead of reintroducing the popup.
  assert.match(page, /data-testid="pet-home-stage"/);
  assert.match(page, /<ViewportScenePortal enabled=\{!homeOutdoorCameraBlocked\}>/);
  assert.match(page, /HOME_TOUCH_SURFACE_STYLE/);
  assert.match(page, /<PetHomeTutorialOverlay/);
  assert.match(app, /location\.startsWith\("\/pet-care\/"\)/);
  assert.match(app, /<PetCarePage \/>/);
});
