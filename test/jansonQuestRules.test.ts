import assert from "node:assert/strict";
import test from "node:test";
import { isJansonQuestKey, jansonQuestStatus } from "../server/jansonQuestRules";

test("Janson's fishing chapters unlock in order and stay claimed", () => {
  assert.equal(jansonQuestStatus("catch_fish", null, false), "available");
  assert.equal(jansonQuestStatus("sell_fish", null, false), "locked");
  assert.equal(jansonQuestStatus("catch_fish", {}, false), "accepted");
  assert.equal(jansonQuestStatus("catch_fish", { completed_at: new Date() }, false), "completed");
  assert.equal(jansonQuestStatus("catch_fish", { reward_claimed_at: new Date() }, false), "claimed");
  assert.equal(jansonQuestStatus("sell_fish", null, true), "available");
  assert.equal(jansonQuestStatus("sell_fish", {}, true), "accepted");
  assert.equal(jansonQuestStatus("sell_fish", { completed_at: new Date() }, true), "completed");
  assert.equal(jansonQuestStatus("sell_fish", { reward_claimed_at: new Date() }, true), "claimed");
  assert.equal(isJansonQuestKey("use_powerup"), false);
});
