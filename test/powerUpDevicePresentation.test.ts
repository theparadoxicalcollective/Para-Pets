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


test("Power Up sizing is based on the logical stage instead of the outer tablet viewport", () => {
  const power = read("client/src/components/PetPowerUpPage.tsx");
  const evolution = read("client/src/components/powerup/EvolutionPanel.tsx");

  assert.doesNotMatch(power, /\d+(?:\.\d+)?vw/);
  assert.doesNotMatch(evolution, /\d+(?:\.\d+)?vw/);
  assert.match(power, /calc\(62 \* var\(--vw\)\)/);
  assert.match(evolution, /calc\(14 \* var\(--vw\)\)/);
  assert.match(power, /#game-stage\[data-coordinate-owner="stage"\] \.pupage-stage\{height:clamp\(325px,calc\(89 \* var\(--vw\)\),380px\)/);
  assert.match(power, /#game-stage\[data-coordinate-owner="stage"\] \.pupage-pet-zone\{width:min\(calc\(62 \* var\(--vw\)\),260px\)/);
});

test("wide-device Power Up uses one full-device background instead of a second inner page rectangle", () => {
  const power = read("client/src/components/PetPowerUpPage.tsx");

  assert.match(power, /#game-stage\[data-coordinate-owner="stage"\] \.pupage\{background:transparent\}/);
  assert.match(power, /#game-stage\[data-coordinate-owner="stage"\] \.pupage-bg,[\s\S]*\.pupage-vignette\{display:none\}/);
  assert.match(power, /data-testid="power-up-viewport-backdrop"/);
});
