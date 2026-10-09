import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const closet = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const tablet = readFileSync("client/src/tabletStageShell.css", "utf8");

test("tablet Closet controls are scoped to existing artwork-owned UI", () => {
  assert.match(closet, /data-responsive-closet="true"/);
  for (const cls of ["closet-accessory-slots", "closet-mini-pet-trigger", "closet-mini-pet-panel", "closet-accessory-drawer"]) {
    assert.ok(closet.includes(cls));
    assert.ok(tablet.includes(cls));
  }
  assert.match(tablet, /@media \(min-width: 768px\) \{[\s\S]*?\[data-responsive-closet="true"\]/);
  assert.match(tablet, /#game-viewport-page \.closet-accessory-drawer/);
  assert.match(tablet, /#game-stage\[data-coordinate-owner="stage"\] \.closet-accessory-drawer/);
  assert.match(tablet, /-webkit-overflow-scrolling: touch/);
});

test("Closet still uses original oval, slot drop targets and equipment saving", () => {
  assert.match(closet, /<PetPageOvalPlacement page="closet"/);
  assert.match(closet, /data-testid="closet-pet-preview"/);
  assert.match(closet, /data-slot-index=\{slot\}/);
  assert.match(closet, /data-testid="button-open-mini-pets"/);
  assert.match(closet, /data-testid="accessory-bag-drawer"/);
  assert.match(closet, /\/api\/pet\/\$\{petInventoryId\}\/accessories/);
});
