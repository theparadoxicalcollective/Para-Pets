import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("active pet uses screen-relative four-option rollout", () => {
  assert.match(source, /data-testid="active-pet-rollout-menu"/);
  assert.match(source, /<ViewportHudPortal>/);
  for (const id of ["button-toggle-pet-menu", "button-action-power-up", "button-action-level-up", "button-action-equip-accessories", "button-action-care-feed"]) {
    assert.ok(source.includes(`data-testid="${id}"`), id);
  }
  assert.doesNotMatch(source, /data-testid="active-pet-action-canonical-ring"/);
  assert.doesNotMatch(source, /data-testid="button-action-pet-stats"/);
});

test("menu routes retain existing power-up, closet, care and level-up behavior", () => {
  assert.match(source, /setActivePetModal\("power_up"\)/);
  assert.match(source, /navigate\("\/equip-accessories"\)/);
  assert.match(source, /navigate\(id \? `\/pet-care\//);
  assert.match(source, /navigate\(`\/pet-level-up\//);
});
