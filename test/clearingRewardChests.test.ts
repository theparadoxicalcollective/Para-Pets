import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CLEARING_CHEST_REWARDS } from "../server/clearingRewardChests";

const combat=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
const ui=fs.readFileSync("client/src/components/ClearingRewardChests.tsx","utf8");
const service=fs.readFileSync("server/clearingRewardChests.ts","utf8");

test("enemy defeat creates proximity currency and equipment-only chests",()=>{
  assert.match(service,/if\(!equipment\.length\)return null/);
  assert.match(combat,/ClearingCurrencyDropLayer/);
  assert.match(combat,/data\.chest/);
  assert.match(service,/exp:0,coins:0,essence:0/);
});

test("bundle supports two equipment rewards without increasing the established six-percent expectation",()=>{
  assert.ok(Math.abs(CLEARING_CHEST_REWARDS.firstEquipmentChance+CLEARING_CHEST_REWARDS.secondEquipmentChance-.06)<Number.EPSILON);
  assert.equal(CLEARING_CHEST_REWARDS.maxEquipment,2);
  assert.match(service,/equipment\.push/);
});

test("claim is one locked transaction and retries return already claimed",()=>{
  assert.match(service,/FOR UPDATE/);
  assert.match(service,/alreadyClaimed:true/);
  assert.match(service,/UPDATE clearing_reward_chests SET claimed_at/);
  assert.match(service,/for\(const item of rewards\.equipment\)/);
});

test("chests require activation, popup opening does not claim, and Collect All claims the bundle",()=>{
  assert.match(ui,/"Open treasure chest"/);
  assert.match(ui,/onClick=.*onOpen/);
  assert.match(ui,/"Collect All"/);
  assert.doesNotMatch(ui,/onOpen\(chest\).*claim/i);
  assert.match(combat,/chests\/\$\{selectedChest\.chestId\}\/claim/);
});

test("rarity sparkle is equipment-only, localized, and reduced-motion safe",()=>{
  assert.match(ui,/highestEquipmentRarity/);
  assert.match(combat,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(ui,/glow/i);
  assert.match(combat,/clearing-chest-sparkles/);
});

test("reward dialog is mobile bounded, scrollable, accessible, and pauses combat",()=>{
  assert.match(ui,/100dvh/);
  assert.match(ui,/createPortal/);
  assert.match(ui,/overflow-y-auto/);
  assert.match(ui,/aria-modal="true"/);
  assert.match(combat,/Boolean\(selectedChest\).*"menu-paused"/);
});

test("closed and opened chest art have distinct interaction states",()=>{
  assert.match(ui,/icon_gift_treasure\.png/);
  assert.match(ui,/hub_chest_opened\.png/);
  assert.match(ui,/"closed" \| "opening" \| "opened"/);
  assert.match(combat,/if\(openingChestId\|\|selectedChest\)return/);
});

test("equipment rewards are visual tiles with a non-claiming detail view",()=>{
  assert.match(ui,/clearing-item-detail/);
  assert.match(ui,/Attack \+\$\{item\.atkBonus\}/);
  assert.doesNotMatch(ui,/item\.name<\/b>/);
  assert.match(ui,/onClick=\{\(\)=>setDetail\(item\)\}/);
});
