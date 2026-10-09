import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("tablet Level Up stage UI can scroll to otherwise clipped controls", () => {
  const source = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
  assert.match(source, /@media\(min-width:768px\)\{[\s\S]*?#game-stage\[data-coordinate-owner="stage"\] \.lupage-scroll\{[\s\S]*?overflow-y:auto/);
  assert.match(source, /#game-stage\[data-coordinate-owner="stage"\] \.lupage-stage\{[\s\S]*?min-height:300px/);
  assert.match(source, /#game-stage\[data-coordinate-owner="stage"\] \.lupage-pet-zone\{[\s\S]*?flex-shrink:0/);
  assert.match(source, /<PetPageOvalPlacement/);
  assert.match(source, /data-testid="level-up-viewport-backdrop"/);
});

test("tablet-only rules leave compact phone composition intact", () => {
  const source = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
  assert.match(source, /@media\(max-width:430px\)/);
  assert.match(source, /@media\(min-width:768px\)/);
  assert.doesNotMatch(source, /\.lupage-scroll\{[^}]*overflow-y:auto[^}]*\}/);
});
