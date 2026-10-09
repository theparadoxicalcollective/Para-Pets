import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");

test("full-device route ownership stays separate from authored coordinates", () => {
  assert.match(surface, /data-page-presentation=\{fullViewport \? "full-viewport" : target \? "viewport" : "stage"\}/);
  assert.match(surface, /data-stage-reference-plane="true"/);
  assert.match(surface, /return target \? createPortal\(content, target\) : content/);
  assert.doesNotMatch(surface, /stage-page-viewport-visual/);
  assert.match(app, /id="game-viewport-page"/);
});

test("iPhone 12 remains the canonical admin and gameplay reference", () => {
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /if \(Math\.round\(viewportWidth\) === DESIGN_W\) return false/);
});
