import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("retired Begin Journey and NPC intro assets are removed instead of feature-flagged", () => {
  for (const filename of [
    "client/src/components/BeginJourneyOverlay.tsx",
    "client/src/components/NpcQuestDiscoveryGuide.tsx",
    "client/src/lib/beginJourney.ts",
    "client/src/lib/tutorialHatch.ts",
    "server/tutorial/config.ts",
    "server/tutorial/errors.ts",
    "server/tutorial/tutorialService.ts",
  ]) assert.equal(existsSync(filename), false, filename + " must not ship");
  const app = read("client/src/App.tsx");
  const home = read("client/src/pages/HomePage.tsx");
  const nav = read("client/src/components/FloatingNav.tsx");
  const welcome = read("client/src/components/WelcomeGiftScreen.tsx");
  for (const [name,source] of [["App",app],["Home",home],["Navigation",nav],["Welcome",welcome]]) {
    assert.doesNotMatch(source, /BeginJourneyOverlay|NpcQuestDiscoveryGuide|beginJourney|BEGIN_JOURNEY_ENABLED|bjGetStep|bjSetStep|bjRestart|BJ_EVENT|bjIsStep5/,
      name + " must not depend on an old tutorial");
  }
  assert.doesNotMatch(home, /tutorialFill|button-begin-journey|Begin Here|data-bj=/);
  assert.doesNotMatch(nav, /tutorialClaimMutation|showLoginHint|Begin Journey/);
  assert.match(welcome, /Collect & Continue/);
  assert.match(welcome, /\/api\/rewards\/\$\{rewardId\}\/claim/);
});

test("normal eggs, potion use and other quest systems are unaffected", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const progression = read("server/routes/petProgressionItem.routes.ts");
  const nav = read("client/src/components/FloatingNav.tsx");
  const routes = read("server/routes/quest.routes.ts");
  assert.match(home, /if \(eggHatchReady\)/);
  assert.match(home, /active-pet-speedup-viewport-modal/);
  assert.match(home, /button-hatch-ready-egg/);
  assert.match(home, /itemInventoryId: itemInvId/);
  assert.match(progression, /specialType === "hatch_time"/);
  assert.match(progression, /currentStart\.getTime\(\) - specialAmount \* 60 \* 1000/);
  assert.doesNotMatch(progression, /tutorialFill|allowInstantFill|tutorialStepMs/);
  assert.match(nav, /visibleDailyQuests\.map\(\(quest\) =>/);
  assert.match(nav, /ginnyData\?\.status === "completed"/);
  assert.match(routes, /GINNY_MINI_PET_QUEST_KEY/);
  assert.match(routes, /janson:catch_fish/);
  assert.doesNotMatch(routes, /BEGIN_JOURNEY_TUTORIAL|npc-discovery-tour/);
});

test("old tutorial APIs and starter item grants no longer exist, but historical data is retained", () => {
  const routes = read("server/routes.ts");
  const schema = read("shared/schema.ts");
  const admin = read("server/routes/quest.routes.ts");
  assert.doesNotMatch(routes, /app\.(?:get|post)\("\/api\/tutorial\//);
  assert.doesNotMatch(routes, /grantTutorialHatchPotions|claimTutorialReward|grant-starter-egg/);
  assert.doesNotMatch(admin, /tutorial_quest_completed|tutorial_reward_claimed|tutorial_hatch_potions_claimed/);
  for (const field of ["tutorial_quest_completed","tutorial_reward_claimed","tutorial_hatch_potions_claimed"]) {
    assert.ok(schema.includes(field), "historic player record must not be erased: " + field);
  }
  assert.doesNotMatch(routes, /DELETE FROM users[\s\S]*tutorial_/);
});
