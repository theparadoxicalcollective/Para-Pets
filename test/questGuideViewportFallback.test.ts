import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guide = readFileSync("client/src/lib/questGuideViewport.ts", "utf8");

test("unanchored quest guides use viewport HUD on migrated gameplay routes", () => {
  assert.match(guide, /getElementById\("game-viewport-hud"\)/);
  assert.doesNotMatch(guide, /stage\?\.dataset\.coordinateOwner === "viewport"/);
  assert.match(guide, /if \(hud\) \{/);
  assert.match(guide, /const rect = hud\.getBoundingClientRect\(\)/);
  assert.match(guide, /width = hud\.clientWidth \|\| rect\.width/);
  assert.match(guide, /height = hud\.clientHeight \|\| rect\.height/);
  assert.match(guide, /target: hud,[\s\S]*?inStage: true/);
  assert.match(guide, /scale: Math\.max\(rect\.width \/ Math\.max\(1, width\), 0\.0001\)/);
});

test("stage fallback remains available while HUD is not mounted", () => {
  assert.match(guide, /const surface = getStageSurface\(\)/);
  assert.match(guide, /inStage: !surface\.viewportOwned/);
  assert.match(guide, /const expanded = getExpandedQuestGuideSurface\(anchor\)/);
  assert.match(guide, /if \(expanded\) return expanded/);
});
