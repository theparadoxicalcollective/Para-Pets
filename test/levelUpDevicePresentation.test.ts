import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, clientRectPointToStage, logicalToRendered, renderedToLogical } from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

test("Level Up uses local page ownership without restoring HomePage", () => {
  const level = read("client/src/components/PetLevelUpPage.tsx");
  const route = read("client/src/pages/PetLevelUpRoute.tsx");
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(level, /\.lupage\{position:absolute;inset:0;width:100%;height:100%/);
  assert.match(level, /data-stage-coordinate-space=\{deviceSurface \? "viewport" : "canonical"\}/);
  assert.doesNotMatch(level, /\.lupage\{position:fixed/);
  assert.doesNotMatch(level, /max-width:768px/);
  assert.match(route, /data-testid="pet-level-up-route-error"[\s\S]*data-stage-coordinate-space="viewport"/);
  assert.match(route, /position: "absolute"/);
  assert.doesNotMatch(home, /<PetLevelUpPage/);
});

test("Level Up extends only its surroundings while preserving the isolated page", () => {
  const level = read("client/src/components/PetLevelUpPage.tsx");

  assert.match(level, /useStageSurroundings\(\{/);
  assert.match(level, /imageUrl: forestBg/);
  assert.match(level, /backgroundColor: "#060a09"/);
  assert.match(level, /backgroundPosition: "center center"/);
  assert.match(level, /<ViewportBackdropPortal>/);
  assert.match(level, /data-testid="level-up-viewport-backdrop"/);
  assert.doesNotMatch(level, /data-canonical-visual-layer="duplicate-backdrop"/);
  assert.doesNotMatch(level, /className="lupage-bg"/);
  assert.match(level, /@assets\/uploads\/NewActivePetBG\.png/);
  assert.ok(level.includes('#game-stage[data-coordinate-owner="stage"] .lupage[data-stage-coordinate-space="canonical"]{background:transparent}'));
  assert.ok(level.includes('.lupage[data-stage-coordinate-space="viewport"]{background:#060a09}'));
});

test("Level Up drag ghosts and sparks use coordinates local to the isolated page", () => {
  const level = read("client/src/components/PetLevelUpPage.tsx");

  assert.match(level, /localPoint\(event\.clientX, event\.clientY\)/);
  assert.match(level, /localPoint\(r\.left \+ r\.width \/ 2, r\.top \+ r\.height \/ 2\)/);
  assert.match(level, /\.lupage-ghost\{position:absolute/);
  assert.match(level, /\.lupage-spark\{position:absolute/);
  assert.doesNotMatch(level, /\.lupage-ghost\{position:fixed/);
  assert.doesNotMatch(level, /\.lupage-spark\{position:fixed/);
});

test("logical Level Up coordinates round-trip on iPhone, Android, tablet and desktop stage layouts", () => {
  const viewports = [
    [390, 844, false],
    [412, 915, true],
    [768, 1024, true],
    [1366, 768, false],
    [1920, 1080, false],
  ] as const;

  for (const [width, height, fitPortraitReference] of viewports) {
    const layout = calculateStageLayout(width, height, 0, 0, { fitPortraitReference });
    const logical = { x: 195, y: 422 };
    const rendered = logicalToRendered(layout, logical.x, logical.y);
    const roundTrip = renderedToLogical(layout, rendered.x, rendered.y);

    assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
  }

  assert.equal(typeof clientRectPointToStage, "function");
});
