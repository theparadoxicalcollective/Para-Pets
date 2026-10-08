import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync("client/src/components/QuestGuideSpotlight.tsx", "utf8");
const home = readFileSync("client/src/components/PetHomeTutorialOverlay.tsx", "utf8");

test("guided pan allows background pointer and click lifecycle without enabling unrelated controls", () => {
  assert.match(guide, /if \(mode === "pan"\)/);
  assert.match(guide, /element\?\.closest\("\[data-quest-guide-pan-surface\]"\)/);
  assert.match(guide, /!element\.closest\(INTERACTIVE_SELECTOR\)/);
  assert.match(guide, /swallow\(event\)/);
  assert.match(guide, /insideAllowed\(event\)/);
});

test("shared guide keeps the Home Bundle tutorial arrow asset and DOM target alignment", () => {
  const arrow = /Photoroom_20260616_95112_PM_1781667768792\.png/;
  assert.match(guide, arrow);
  assert.match(home, arrow);
  assert.match(guide, /getBoundingClientRect\(\)/);
  assert.match(home, /getBoundingClientRect\(\)/);
});
