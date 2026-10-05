import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identity = readFileSync("server/qaTester.ts", "utf8");
const qaRoutes = readFileSync("server/routes/qaTester.routes.ts", "utf8");
const molten = readFileSync("server/routes/moltenBlocks.routes.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const chatFilter = readFileSync("server/routes/chatFilter.routes.ts", "utf8");

test("QA tester identity is narrower than generic moderator access", () => {
  assert.match(identity, /QA_MOD_ACCOUNT_ENABLED/);
  assert.match(identity, /QA_MOD_USERNAME/);
  assert.match(identity, /QA_MOD_EMAIL/);
  assert.match(identity, /user\.isAdmin !== true/);
  assert.match(identity, /user\.isModerator === true/);
  assert.match(identity, /user\.isBot !== true/);
  assert.match(identity, /user\.emailVerified === true/);
});

test("QA tools are self-only and do not accept a target player", () => {
  assert.match(qaRoutes, /\/api\/qa\/status/);
  assert.match(qaRoutes, /\/api\/qa\/reset\/quests/);
  assert.match(qaRoutes, /\/api\/qa\/reset\/daily-minigames/);
  assert.match(qaRoutes, /\/api\/qa\/grant/);
  assert.match(qaRoutes, /isDedicatedQaTester\(req\.user\)/);
  assert.doesNotMatch(qaRoutes, /targetUserId|moderatorUserId|playerUserId/);
});

test("QA quest reset covers onboarding and guided quest state without deleting rewards", () => {
  assert.match(qaRoutes, /tutorial_hatch_potions_claimed = false/);
  assert.match(qaRoutes, /DELETE FROM pet_home_tutorial_progress/);
  assert.match(qaRoutes, /DELETE FROM user_ginny_mini_pet_quests/);
  assert.match(qaRoutes, /DELETE FROM user_janson_quests/);
  assert.match(qaRoutes, /DELETE FROM user_janson_daily_quests/);
  assert.match(qaRoutes, /DELETE FROM user_daily_quest_progress/);
  assert.match(qaRoutes, /LONELLE_KEY/);
  assert.match(qaRoutes, /npc_discovery_tour_reset:/);
  assert.doesNotMatch(qaRoutes, /DELETE FROM user_rewards/);
});

test("QA mini-game reset covers Beau, Bingo, Slots, and Molten Blocks", () => {
  assert.match(qaRoutes, /DELETE FROM beau_prize_wheel_spins/);
  assert.match(qaRoutes, /DELETE FROM haunted_bingo_rounds/);
  assert.match(qaRoutes, /haunted_slots_free_500_v1:/);
  assert.match(qaRoutes, /resetMoltenBlocksRewardState/);
  assert.match(molten, /export function resetMoltenBlocksRewardState/);
});

test("QA self-funding is bounded and does not count as earned progression", () => {
  assert.match(qaRoutes, /coins > 100000/);
  assert.match(qaRoutes, /quantity > 20/);
  assert.match(qaRoutes, /UPDATE users SET coins = coins \+ \$\{coins\}/);
  assert.doesNotMatch(qaRoutes, /total_coins_earned = total_coins_earned \+/);
});

test("QA tester cannot create real-money checkout or edit chat moderation filters", () => {
  assert.match(routes, /Real-money checkout is disabled for the QA tester account/);
  assert.match(routes, /isDedicatedQaTester\(user\)/);
  assert.match(chatFilter, /isDedicatedQaTester\(user\)/);
});
