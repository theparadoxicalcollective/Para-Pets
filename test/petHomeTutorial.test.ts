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
  assert.match(overlay, /revealHomeScene \? "rgba\(0,0,0,0\.08\)" : "rgba\(0,0,0,0\.62\)"/);
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
});


test("Pet Home tutorial follows the live Home stage across Safari Chrome Android tablet and desktop viewports", () => {
  const overlay = fs.readFileSync("client/src/components/PetHomeTutorialOverlay.tsx", "utf8");
  const page = fs.readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

  // The guide measures the same rendered controls used by the iPhone/mobile
  // Home layout instead of maintaining device-specific duplicate coordinates.
  assert.match(page, /data-testid="pet-home-stage"/);
  assert.match(overlay, /document\.querySelector\('\[data-testid="pet-home-stage"\]'\)/);
  assert.match(overlay, /getBoundingClientRect\(\)/);
  assert.match(overlay, /const centerX = stage\.left \+ stage\.width \/ 2/);
  assert.match(overlay, /left: layout\.stage\.left/);
  assert.match(overlay, /width: layout\.stage\.width/);
  assert.match(overlay, /maxWidth: 768/);

  // Safari/iOS browser chrome changes the VisualViewport independently of the
  // layout viewport; Android Chrome and desktop/tablet resizing use the same path.
  assert.match(overlay, /window\.visualViewport/);
  assert.match(overlay, /visualViewport\?\.offsetTop/);
  assert.match(overlay, /visualViewport\?\.height/);
  assert.match(overlay, /window\.addEventListener\("resize"/);
  assert.match(overlay, /window\.addEventListener\("orientationchange"/);
  assert.match(overlay, /visualViewport\?\.addEventListener\("resize"/);
  assert.match(overlay, /visualViewport\?\.addEventListener\("scroll"/);
  assert.match(overlay, /ResizeObserver/);
  assert.match(overlay, /HOME_FIXED_VIEWPORT_STYLE/);
  assert.match(overlay, /HOME_TOUCH_SURFACE_STYLE/);
  assert.match(overlay, /maxHeight: "calc\(var\(--home-visual-height, 100dvh\) - 28px\)"/);

  // PC keyboard users cannot tab out of the modal and mobile keeps a full-size
  // Continue touch target while the underlying Home remains blocked.
  assert.match(overlay, /event\.key === "Tab" \|\| event\.key === "Escape"/);
  assert.match(overlay, /button-pet-home-tutorial-continue/);
  assert.match(overlay, /minHeight: 44/);
  assert.doesNotMatch(overlay, /navigator\.userAgent|Android|iPhone|iPad|Chrome|Safari/);
});
