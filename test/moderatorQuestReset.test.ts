import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routes = fs.readFileSync("server/routes/quest.routes.ts", "utf8");

test("moderator reset lists only active NPC and daily quests, not retired onboarding", () => {
  assert.match(routes, /GINNY_MINI_PET_QUEST_KEY/);
  assert.match(routes, /SELECT quest_key, title, is_active\s+FROM daily_quests/);
  assert.match(routes, /WHERE is_moderator = true/);
  assert.doesNotMatch(routes, /BEGIN_JOURNEY_TUTORIAL|NPC_DISCOVERY_TOUR_QUEST_KEY|npc-discovery-tour/);
});

test("moderator resets remain authenticated and moderator-scoped", () => {
  assert.match(routes, /app\.post\("\/api\/admin\/moderator-quests\/reset", isAuthenticated/);
  assert.match(routes, /if \(!admin\.isAdmin\) return res\.status\(403\)/);
  assert.match(routes, /target\.is_moderator !== true/);
  assert.match(routes, /Quest resets are limited to moderator accounts/);
  assert.match(routes, /DELETE FROM pet_equipped_mini_pets[\s\S]*DELETE FROM user_ginny_mini_pet_quests/);
  assert.match(routes, /DELETE FROM user_daily_quest_progress[\s\S]*quest_date = \$\{getCentralDate\(\)\}/);
  const handler = routes.slice(routes.indexOf('app.post("/api/admin/moderator-quests/reset"'));
  assert.doesNotMatch(handler, /DELETE FROM user_inventory|tutorial_quest_completed|tutorial_reward_claimed/);
  assert.doesNotMatch(handler, /(?:coins|total_coins_earned)\s*=/);
});

test("retired onboarding is removed from login, not just disabled", () => {
  const app = fs.readFileSync("client/src/App.tsx", "utf8");
  const welcome = fs.readFileSync("client/src/components/WelcomeGiftScreen.tsx", "utf8");
  assert.doesNotMatch(app, /BeginJourneyOverlay|NpcQuestDiscoveryGuide|bjGetStatus|bjRestart|bjUsePlayer/);
  assert.doesNotMatch(welcome, /bjStart|BEGIN_JOURNEY_ENABLED/);
  assert.match(welcome, /Collect & Continue/);
});
