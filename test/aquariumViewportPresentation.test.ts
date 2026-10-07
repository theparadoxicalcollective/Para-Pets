import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, calculateViewportSurfaceRect } from "../client/src/lib/stage";

const aquarium = readFileSync("client/src/pages/AquariumPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");
const stageViewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");

test("Aquarium tablet presentation reaches device edges while the canonical tank remains unchanged", () => {
  const layout = calculateStageLayout(834, 1194, 0, 0, { fitPortraitReference: true });
  const surface = calculateViewportSurfaceRect(layout);

  assert.equal(layout.designWidth, 390);
  assert.equal(layout.designHeight, 844);
  assert.ok(surface.left < 0, "tablet camera should extend left of the canonical tank");
  assert.ok(surface.width > layout.designWidth, "tablet camera should be wider than the canonical tank");

  assert.match(stageViewport, /const surface = calculateViewportSurfaceRect\(layout\)/);
  assert.match(stageViewport, /const surfaceRight = layout\.designWidth - \(surface\.left \+ surface\.width\)/);
  assert.match(stageViewport, /--viewport-surface-left/);
  assert.match(stageViewport, /--viewport-surface-right/);

  assert.match(shell, /button-close-aquarium[\s\S]*--viewport-surface-right/);
  assert.match(shell, /button-aquarium-set-default[\s\S]*--viewport-surface-left/);
  assert.match(shell, /button-aquarium-prev[\s\S]*--viewport-surface-left/);
  assert.match(shell, /button-aquarium-next[\s\S]*--viewport-surface-right/);
});

test("Aquarium hides the launching stage only on stage-owned layouts so the real aquarium backdrop is visible", () => {
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] #game-stage-content:has\(\[data-testid="aquarium-page"\]\) > \*[\s\S]*visibility: hidden/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-testid="aquarium-page"\][\s\S]*visibility: visible !important/);
  assert.doesNotMatch(shell, /#game-stage\[data-coordinate-owner="viewport"\][\s\S]*aquarium-page/);
});

test("Aquarium fish positions and add/drop boundary remain canonical percentages", () => {
  assert.match(aquarium, /left: `\$\{f\.x\}%`, top: `\$\{f\.y\}%`/);
  assert.match(aquarium, /const py = \(\(e\.clientY - rect\.top\) \/ rect\.height\) \* 100/);
  assert.match(aquarium, /if \(py < 78\) addFish\(d\.fish\)/);
  assert.match(aquarium, /const AQ_MAX = 30/);
});

test("Aquarium blocking overlays can cover the physical device without changing their dialog contents", () => {
  assert.match(shell, /\[data-testid="aquarium-page"\] > \.absolute\.inset-0\.z-20/);
  assert.match(shell, /\[data-testid="aquarium-page"\] > \.absolute\.inset-0\.z-50/);
  assert.match(shell, /left: var\(--viewport-surface-left, 0px\) !important/);
  assert.match(shell, /right: var\(--viewport-surface-right, 0px\) !important/);
  assert.match(aquarium, /data-testid="button-return-fish-to-bag"/);
  assert.match(aquarium, /data-testid="button-buy-aquarium"/);
  assert.match(aquarium, /data-testid="button-confirm-buy-aquarium"/);
});
