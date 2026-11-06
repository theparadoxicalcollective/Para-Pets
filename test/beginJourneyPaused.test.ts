import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("Begin Journey can be resumed later without deleting old tutorial data or server receipts", () => {
  const flag = source("client/src/lib/beginJourney.ts");
  const app = source("client/src/App.tsx");
  const overlay = source("client/src/components/BeginJourneyOverlay.tsx");
  const server = source("server/tutorial/tutorialService.ts");
  const schema = source("shared/schema.ts");
  assert.match(flag, /export const BEGIN_JOURNEY_ENABLED = false/);
  assert.match(flag, /function bjGetStep\(/);
  assert.match(flag, /function bjUsePlayer\(/);
  assert.match(flag, /bj_starter_inventory_id/);
  assert.match(app, /if \(!BEGIN_JOURNEY_ENABLED \|\| !user \|\| showWelcome\) return/);
  assert.match(app, /\{BEGIN_JOURNEY_ENABLED && <BeginJourneyOverlay user=\{user\} \/>\}/);
  assert.match(overlay, /if \(!BEGIN_JOURNEY_ENABLED\) return null;/);
  assert.match(overlay, /return <ActiveBeginJourneyOverlay \{\.\.\.props\} \/>/);
  assert.match(server, /tutorial_quest_completed/);
  assert.match(server, /tutorial_reward_claimed/);
  assert.match(schema, /tutorial_quest_completed/);
  assert.match(schema, /tutorial_reward_claimed/);
  assert.doesNotMatch(app, /removeItem\(["']bj_step/);
});

test("new players collect welcome gifts normally but do not automatically start Begin Journey", () => {
  const welcome = source("client/src/components/WelcomeGiftScreen.tsx");
  const app = source("client/src/App.tsx");
  assert.match(welcome, /POST\x22, \x60\/api\/rewards\/\$\{rewardId\}\/claim\x60/);
  assert.match(welcome, /if \(BEGIN_JOURNEY_ENABLED\) bjStart\(\)/);
  assert.match(welcome, /Collect & Continue/);
  assert.match(welcome, /onComplete\(data\.user \?\? null\)/);
  assert.match(app, /<WelcomeGiftScreen/);
});

test("quest log and first-pet empty state no longer advertise the paused tutorial", () => {
  const nav = source("client/src/components/FloatingNav.tsx");
  const home = source("client/src/pages/HomePage.tsx");
  assert.match(nav, /const showLoginHint = BEGIN_JOURNEY_ENABLED &&/);
  assert.match(nav, /const tutorialClaimable = BEGIN_JOURNEY_ENABLED &&/);
  assert.match(nav, /\{BEGIN_JOURNEY_ENABLED && !\(user as any\)\.tutorial_reward_claimed && \(/);
  assert.match(home, /const canBeginJourney = BEGIN_JOURNEY_ENABLED && !inventoryLoading/);
  assert.match(home, /const isBeginJourneyStep5 = \(\) => BEGIN_JOURNEY_ENABLED && bjGetStep\(\) === 5/);
  assert.match(home, /const tutorialStep = BEGIN_JOURNEY_ENABLED \? bjGetStep\(\) : null/);
  assert.match(home, /if \(isBeginJourneyStep5\(\)\)/);
  assert.match(home, /!isBeginJourneyStep5\(\) && showSpeedUp/);
  assert.match(home, /\(BEGIN_JOURNEY_ENABLED && bjIsStep5TapMode\(\)\) \|\| eggHatchReady/);
  assert.match(nav, /visibleDailyQuests\.map\(\(quest\) =>/);
  assert.match(nav, /ginnyData\?\.status === "completed"/);
});

test("remaining quests and NPC story arcs are not disabled by the pause", () => {
  const npc = source("client/src/components/NpcQuestDiscoveryGuide.tsx");
  const quest = source("server/routes/quest.routes.ts");
  const floatingNav = source("client/src/components/FloatingNav.tsx");
  assert.match(npc, /\/api\/quests\/ginny-mini-pet/);
  assert.match(npc, /\/api\/quests\/lonelle-lost-adornment/);
  assert.match(npc, /\/api\/quests\/janson/);
  assert.match(quest, /GINNY_MINI_PET_QUEST_KEY/);
  assert.match(floatingNav, /queryKey: \["\/api\/quests\/daily"\]/);
});
