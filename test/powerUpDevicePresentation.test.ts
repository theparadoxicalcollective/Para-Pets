import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Power Up keeps its authored UI on the canonical stage", () => {
  const source = read("client/src/components/PetPowerUpPage.tsx");

  assert.match(source, /\.pupage\{position:absolute;inset:0;width:100%;height:100%/);
  assert.match(source, /data-stage-coordinate-space="canonical"/);
  assert.doesNotMatch(source, /\.pupage\{position:fixed/);
  assert.doesNotMatch(source, /max-width:768px/);
  assert.match(source, /\.pupage-stats-backdrop\{position:absolute/);
});

test("Power Up temporarily owns the expanded device backdrop", () => {
  const power = read("client/src/components/PetPowerUpPage.tsx");
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(power, /<ViewportBackdropPortal>/);
  assert.match(power, /data-testid="power-up-viewport-backdrop"/);
  assert.match(power, /url\(\$\{pupBackground\}\)/);
  assert.match(home, /activePetModal !== "power_up"[\s\S]*<ViewportBackdropPortal>/);
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
});

test("Power Up drag ghosts and spark origins use logical stage coordinates", () => {
  const source = read("client/src/components/PetPowerUpPage.tsx");

  assert.match(source, /clientToStage\(event\.clientX, event\.clientY\)/);
  assert.match(source, /clientRectPointToStage\(r\)/);
  assert.match(source, /\.pupage-ghost\{position:absolute/);
  assert.match(source, /\.pupage-spark\{position:absolute/);
  assert.doesNotMatch(source, /\.pupage-ghost\{position:fixed/);
  assert.doesNotMatch(source, /\.pupage-spark\{position:fixed/);
});

test("Power Up mechanics and pet/evolution ownership stay in their existing component", () => {
  const source = read("client/src/components/PetPowerUpPage.tsx");

  assert.match(source, /<EvolutionPanel enabled fallbackRarity=\{rarity\} layout="orbit" \/>/);
  assert.match(source, /onUseItem\(item\)/);
  assert.match(source, /<PetAnimator[\s\S]*size=\{350\}[\s\S]*fillContainer/);
  assert.match(source, /setNavHidden\(true\)/);
});


test("Power Up close control stays tappable beside the iOS Safari edge", () => {
  const power = read("client/src/components/PetPowerUpPage.tsx");
  const app = read("client/src/App.tsx");

  assert.match(power, /data-ios-edge-control="true" data-testid="button-close-powerup-modal"/);
  assert.match(power, /pupage-corner\{[^}]*touch-action:manipulation/);
  assert.match(app, /touchStartedInIosEdgeControl/);
  assert.match(app, /closest\?\.\('\[data-ios-edge-control="true"\]'\)/);
  assert.match(app, /touchStartedInPetCareShelf \|\| touchStartedInIosEdgeControl/);
});
