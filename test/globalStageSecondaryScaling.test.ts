import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("mini games inherit the authoritative game stage without a second scaler", () => {
  const frame = read("client/src/components/world/MiniGameFrame.tsx");

  assert.doesNotMatch(frame, /ResizeObserver/);
  assert.doesNotMatch(frame, /calculateMiniGamePage/);
  assert.doesNotMatch(frame, /calculateMiniGameScale/);
  assert.doesNotMatch(frame, /scale\(\$\{page\.scale\}\)/);
  assert.match(frame, /data-testid="mini-game-locked-page"/);
  assert.match(frame, /className="absolute inset-0 overflow-hidden"/);
  assert.match(frame, /width: "100%"/);
  assert.match(frame, /height: "100%"/);
});

test("World measures only its logical stage frame and no longer owns browser viewport policy", () => {
  const controller = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(controller, /new ResizeObserver\(measure\)/);
  assert.match(controller, /const width = el\.clientWidth \|\| getDesignW\(\)/);
  assert.match(controller, /const height = el\.clientHeight \|\| DESIGN_H/);
  assert.doesNotMatch(controller, /visualViewport/);
  assert.doesNotMatch(controller, /window\.innerWidth/);
  assert.doesNotMatch(controller, /window\.innerHeight/);
  assert.doesNotMatch(controller, /display-mode: standalone/);
  assert.doesNotMatch(controller, /shouldFitFullWorldComposition/);
  assert.doesNotMatch(controller, /fitFullComposition/);
  assert.doesNotMatch(controller, /orientationchange/);
});

test("World keeps its authored-map cover transform separate from device-stage scaling", () => {
  const controller = read("client/src/worlds/useWorldViewportController.ts");
  const viewport = read("client/src/lib/worldViewport.ts");

  assert.match(controller, /calculateWorldFitScale\(/);
  assert.match(controller, /clampWorldMapOffset\(/);
  assert.match(viewport, /return Math\.max\(frameWidth \/ safeMapWidth, frameHeight \/ safeMapHeight\)/);
  assert.match(viewport, /Keep an oversized world draggable to every edge without showing empty space/);
});

test("World body-level reward effects use the rendered game-stage center", () => {
  const world = read("client/src/pages/WorldPage.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(world, /getStageRenderedCenter/);
  assert.match(world, /const stageCenter = getStageRenderedCenter\(\)/);
  assert.match(world, /burstGoldenOrbs\(stageCenter\.x, stageCenter\.y, 6\)/);
  assert.doesNotMatch(world, /burstGoldenOrbs\(window\.innerWidth \/ 2, window\.innerHeight \/ 2, 6\)/);

  assert.match(stage, /export function getStageRenderedCenter/);
  assert.match(stage, /surface\.left \+ \(surface\.logicalWidth \* surface\.scale\) \/ 2/);
  assert.match(stage, /surface\.top \+ \(surface\.logicalHeight \* surface\.scale\) \/ 2/);
});
