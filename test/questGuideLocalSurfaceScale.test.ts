import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guide = readFileSync("client/src/lib/questGuideViewport.ts", "utf8");

test("expanded quest guide uses its rendered HUD owner rather than root stage scale", () => {
  assert.doesNotMatch(guide, /getStageScale/);
  assert.match(guide, /target\.getBoundingClientRect\(\)/);
  assert.match(guide, /target\.clientWidth \|\| rect\.width/);
  assert.match(guide, /target\.clientHeight \|\| rect\.height/);
  assert.match(guide, /rect\.width \/ Math\.max\(1, logicalWidth\)/);
  assert.match(guide, /getStageSurface\(\)/);
  assert.match(guide, /guideBoundsInSurface/);
});
