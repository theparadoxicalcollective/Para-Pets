import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");

test("full-device stage pages have a visual surface separate from authored coordinates", () => {
  assert.match(surface, /data-testid="stage-page-viewport-visual"/);
  assert.match(surface, /data-stage-page-viewport-visual="true"/);
  assert.match(surface, /pointerEvents: "none"/);
  assert.match(surface, /data-stage-reference-plane="true"/);
});

test("larger-device visual surface fills the route without becoming an input plane", () => {
  assert.match(shell, /\[data-page-presentation="viewport"\] \[data-stage-page-viewport-visual="true"\]/);
  assert.match(shell, /background-size: cover/);
  assert.match(shell, /\[data-page-presentation="viewport"\] \[data-stage-reference-plane="true"\][\s\S]*background-color: transparent !important/);
});

test("iPhone 12 remains the canonical admin/gameplay reference", () => {
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /if \(Math\.round\(viewportWidth\) === DESIGN_W\) return false/);
  assert.match(surface, /\{target && \(/);
  assert.match(surface, /return target \? createPortal\(content, target\) : content/);
});
