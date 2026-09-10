import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("moderator quest reset offers every supported quest family", () => {
  const routes = fs.readFileSync("server/routes/quest.routes.ts", "utf8");

  assert.match(routes, /BEGIN_JOURNEY_TUTORIAL\.id/);
  assert.match(routes, /GINNY_MINI_PET_QUEST_KEY/);
  assert.match(routes, /SELECT quest_key, title, is_active\s+FROM daily_quests/);
  assert.match(routes, /WHERE is_moderator = true/);
});

test("moderator quest reset is administrator-only and rejects non-moderator targets", () => {
  const routes = fs.readFileSync("server/routes/quest.routes.ts", "utf8");

  assert.match(routes, /app\.post\("\/api\/admin\/moderator-quests\/reset", isAuthenticated/);
  assert.match(routes, /if \(!admin\.isAdmin\) return res\.status\(403\)/);
  assert.match(routes, /target\.is_moderator !== true/);
  assert.match(routes, /Quest resets are limited to moderator accounts/);
});

test("each reset clears only the selected quest progress", () => {
  const routes = fs.readFileSync("server/routes/quest.routes.ts", "utf8");

  for (const field of [
    "tutorial_hatch_potions_claimed = false",
    "tutorial_quest_completed = false",
    "tutorial_reward_claimed = false",
  ]) assert.ok(routes.includes(field));

  assert.match(routes, /DELETE FROM pet_equipped_mini_pets[\s\S]*DELETE FROM user_ginny_mini_pet_quests/);
  assert.match(routes, /DELETE FROM user_daily_quest_progress[\s\S]*quest_date = \$\{getCentralDate\(\)\}/);
  const resetHandler = routes.slice(routes.indexOf('app.post("/api/admin/moderator-quests/reset"'));
  assert.doesNotMatch(resetHandler, /DELETE FROM user_inventory/);
  assert.doesNotMatch(resetHandler, /(?:coins|total_coins_earned)\s*=/);
});

test("maintenance UI exposes both dropdowns and login reconciles a tutorial reset", () => {
  const adminPage = fs.readFileSync("client/src/pages/AdminPage.tsx", "utf8");
  const app = fs.readFileSync("client/src/App.tsx", "utf8");

  assert.match(adminPage, /data-testid="select-moderator-quest-user"/);
  assert.match(adminPage, /data-testid="select-moderator-quest"/);
  assert.match(adminPage, /data-testid="button-reset-moderator-quest"/);
  assert.match(adminPage, /Existing pets, coins, and earned rewards are kept/);

  assert.match(app, /moderatorTutorialWasReset/);
  assert.match(app, /moderatorTutorialResetHandledRef/);
  assert.match(app, /bjRestart\(\)/);
});
