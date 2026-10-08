import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Power-Up and Feed quest hints follow real viewport menu controls", () => {
  assert.match(home, /testId="pet-daily-quest-menu-guide"/);
  assert.match(home, /<QuestGuideSpotlight/);
  for (const target of ["button-open-pet-menu", "button-action-power-up", "button-action-care-feed"]) {
    assert.match(home, new RegExp(`\\[data-testid="${target}"\\]`));
  }
  assert.match(home, /focus="control"/);
  assert.doesNotMatch(home, /bottom: "44%"/);
});

test("daily quest destination and petting reward are preserved", () => {
  assert.match(home, /setPowerUpFromQuest\(true\)/);
  assert.match(home, /setActivePetModal\("power_up"\)/);
  assert.match(home, /navigate\(id \? "\/pet-care\/" \+ encodeURIComponent\(id\) : "\/pet-house"\)/);
  assert.match(home, /homePettingRewardMutation\.mutate\(id\)/);
});
