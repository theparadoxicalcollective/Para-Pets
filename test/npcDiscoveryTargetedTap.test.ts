import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync("client/src/components/QuestGuideSpotlight.tsx", "utf8");
const discovery = readFileSync("client/src/components/NpcQuestDiscoveryGuide.tsx", "utf8");

test("NPC tour only advances when pointer is inside the current visible NPC", () => {
  assert.match(guide, /const tourHit = \(x: number, y: number\)/);
  assert.match(guide, /if \(!visible\(current\)\) return false/);
  assert.match(guide, /x >= bounds\.left && x <= bounds\.right && y >= bounds\.top && y <= bounds\.bottom/);
  assert.match(guide, /if \(tourHit\(event\.clientX, event\.clientY\)\) onTourAdvance/);
  assert.match(discovery, /mode=\{guideMode\}/);
  assert.match(discovery, /blockingGuide/);
});

test("world pan mode remains distinct from read-only tour clicks", () => {
  assert.match(guide, /if \(mode === "pan"\)/);
  assert.match(guide, /\[data-quest-guide-pan-surface\]/);
});
