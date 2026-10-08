import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guideTargetOnScreen } from "../client/src/lib/questGuideViewport";

test("partially visible quest targets remain discoverable during map panning", () => {
  assert.equal(guideTargetOnScreen({ left: -80, right: 30, top: 200, bottom: 300 }, 390, 844), true);
  assert.equal(guideTargetOnScreen({ left: 360, right: 450, top: 200, bottom: 300 }, 390, 844), true);
  assert.equal(guideTargetOnScreen({ left: -200, right: -10, top: 200, bottom: 300 }, 390, 844), false);
  assert.equal(guideTargetOnScreen({ left: 390, right: 410, top: 200, bottom: 300 }, 390, 844), false);
});

test("NPC tour follows viewport resize and scroll like shared spotlight", () => {
  const tour = readFileSync("client/src/components/NpcQuestDiscoveryGuide.tsx", "utf8");
  assert.match(tour, /visualViewport\?\.addEventListener\("resize", update\)/);
  assert.match(tour, /visualViewport\?\.addEventListener\("scroll", update\)/);
  assert.match(tour, /visualViewport\?\.removeEventListener\("resize", update\)/);
  assert.match(tour, /visualViewport\?\.removeEventListener\("scroll", update\)/);
});
