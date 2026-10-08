import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("pet menu is a viewport HUD control independent of pet gestures", () => {
  assert.match(source, /data-testid="active-pet-side-menu"/);
  assert.match(source, /data-testid="button-open-pet-menu"/);
  assert.match(source, /aria-expanded=\{showActionMenu\}/);
  assert.doesNotMatch(source, /setShowActionMenu\(true\)/);
  assert.match(source, /homePettingRewardMutation\.mutate\(id\)/);
  assert.doesNotMatch(source, /petActionRingImg/);
});

test("all four existing pet destinations remain accessible without stats action", () => {
  for (const id of ["power-up", "level-up", "equip-accessories", "care-feed"]) {
    assert.match(source, new RegExp(`data-testid="button-action-${id}"`));
  }
  assert.doesNotMatch(source, /data-testid="button-action-pet-stats"/);
  assert.match(source, /navigate\("\/equip-accessories"\)/);
  assert.match(source, /pet-level-up/);
  assert.match(source, /pet-care/);
});
