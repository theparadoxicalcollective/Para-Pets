import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, calculateViewportSurfaceRect } from "../client/src/lib/stage";

const aquarium = readFileSync("client/src/pages/AquariumPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");
const stageViewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");

test("Aquarium tablet presentation owns one top viewport while the canonical tank remains unchanged", () => {
  const layout = calculateStageLayout(834, 1194, 0, 0, { fitPortraitReference: true });
  const surface = calculateViewportSurfaceRect(layout);
  assert.equal(layout.designWidth, 390);
  assert.equal(layout.designHeight, 844);
  assert.ok(surface.width > layout.designWidth);
  assert.match(aquarium, /data-testid="aquarium-page"/);
  assert.match(aquarium, /data-testid="aquarium-viewport-backdrop"/);
  assert.doesNotMatch(aquarium, /ViewportBackdropPortal/);
});

test("Aquarium fish positions and add/drop boundary remain canonical percentages", () => {
  assert.match(aquarium, /left: `\$\{f\.x\}%`, top: `\$\{f\.y\}%`/);
  assert.match(aquarium, /clientPointInStageElement\(container, e\.clientX, e\.clientY\)/);
  assert.match(aquarium, /const py = \(y \/ container\.offsetHeight\) \* 100/);
  assert.match(aquarium, /if \(py < 78\) addFish\(d\.fish\)/);
  assert.doesNotMatch(aquarium, /\(e\.clientY - rect\.top\) \/ rect\.height/);
  assert.match(aquarium, /const AQ_MAX = 30/);
});

test("Aquarium blocking overlays remain inside the top Aquarium owner", () => {
  assert.match(aquarium, /data-testid="button-return-fish-to-bag"/);
  assert.match(aquarium, /data-testid="button-buy-aquarium"/);
  assert.match(aquarium, /data-testid="button-confirm-buy-aquarium"/);
  assert.match(aquarium, /data-testid="aquarium-page"/);
});


test("Aquarium keeps fish simulation in canonical tank percentages", () => {
  assert.match(aquarium, /if \(x < 5\)/);
  assert.match(aquarium, /if \(x > 91\)/);
  assert.match(aquarium, /const yMin = isBottom \? BOTTOM_HARD_MIN : 22/);
  assert.match(aquarium, /const yMax = isBottom \? BOTTOM_HARD_MAX : 71/);
  assert.doesNotMatch(aquarium, /clientWidth|clientHeight/);
});
