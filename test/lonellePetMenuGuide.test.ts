import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lonelle = readFileSync("client/src/components/LonelleQuestOverlay.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Lonelle guides players through the independent Pet Menu instead of tapping their pet", () => {
  assert.match(lonelle, /actionMenuOpen \? '\[data-testid="button-action-equip-accessories"\]' : '\[data-testid="button-open-pet-menu"\]'/);
  assert.match(lonelle, /"Open the Pet Menu"/);
  assert.match(lonelle, /focus = "control"/);
  assert.doesNotMatch(lonelle, /"Tap your pet"/);
  assert.match(home, /data-testid="button-open-pet-menu"/);
  assert.match(home, /data-testid="button-action-equip-accessories"/);
});

test("Lonelle still guides scarf equip through the third adornment slot", () => {
  assert.match(lonelle, /data-testid="slot-costume-3"/);
  assert.match(lonelle, /data-testid="bag-costume-\$\{state\.scarfInventoryId\}"/);
  assert.match(lonelle, /state\.scarfEquipped/);
  assert.match(lonelle, /data-testid="button-close-equip-accessories"/);
});
