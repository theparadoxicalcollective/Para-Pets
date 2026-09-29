import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("moderator quest reset offers every supported quest family", () => {
  const routes = fs.readFileSync("server/routes/quest.routes.ts", "utf8");

  assert.match(routes, /BEGIN_JOURNEY_TUTORIAL\.id/);
  assert.match(routes, /GINNY_MINI_PET_QUEST_KEY/);
  assert.match(routes, /NPC_DISCOVERY_TOUR_QUEST_KEY/);
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

test("maintenance UI omits moderator quest resets while login still reconciles a tutorial reset", () => {
  const adminPage = fs.readFileSync("client/src/pages/AdminPage.tsx", "utf8");
  const maintenance = fs.readFileSync("client/src/components/admin/MaintenanceSection.tsx", "utf8");
  const app = fs.readFileSync("client/src/App.tsx", "utf8");

  assert.doesNotMatch(adminPage, /data-testid="select-moderator-quest-user"/);
  assert.doesNotMatch(adminPage, /data-testid="button-reset-moderator-quest"/);
  assert.doesNotMatch(maintenance, /data-testid="select-moderator-quest-user"/);
  assert.doesNotMatch(maintenance, /data-testid="button-reset-moderator-quest"/);

  assert.match(app, /tutorial_quest_completed/);
  assert.match(app, /bjGetStatus\(\) === "done"/);
  assert.match(app, /bjRestart\(\)/);
});


test("NPC discovery guide reset is server-backed and moderator-scoped", () => {
  const routes = fs.readFileSync("server/routes/quest.routes.ts", "utf8");
  const guide = fs.readFileSync("client/src/components/NpcQuestDiscoveryGuide.tsx", "utf8");

  assert.match(routes, /\/api\/quests\/npc-discovery-tour\/reset-token/);
  assert.match(routes, /npc_discovery_tour_reset:\$\{moderatorUserId\}/);
  assert.match(routes, /INSERT INTO game_settings \(key, value\)/);
  assert.match(routes, /gen_random_uuid\(\)::text/);
  assert.match(routes, /Show NPC Quest Guide/);
  assert.match(guide, /bj_npc_tour_reset_token_v1/);
  assert.match(guide, /refetchInterval: 5_000/);
  assert.match(guide, /saveIndex\(user\.id, 0\)/);
  assert.match(guide, /Array\.from\(new Set\(worlds\.map\(world => world\.worldId\)\)\)/);
  assert.doesNotMatch(guide, /fetch\("\/api\/quests\/ginny-mini-pet"/);
  assert.doesNotMatch(guide, /fetch\("\/api\/quests\/janson"/);
  assert.doesNotMatch(guide, /fetch\("\/api\/quests\/lonelle-lost-adornment"/);
});
