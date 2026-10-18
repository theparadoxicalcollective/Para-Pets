import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const world = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
const cauldron = readFileSync("client/src/components/world/MixingTreeCauldron.tsx", "utf8");
const recipes = readFileSync("client/src/components/world/MixingTreeRecipes.tsx", "utf8");

test("Mixing Tree interior stays above the viewport world scene without moving unrelated locations", () => {
  assert.match(world, /<ViewportModalPortal enabled=\{showLocationView && activeLocationId === ELYSIAN_BAYOU_LOCATION_IDS\.bayousHeart\}>\s*\{showLocationView && \(\(\) => \{/);
  assert.match(world, /\}\)\(\)\}\s*<\/ViewportModalPortal>\s*\{showAddObject/);
  assert.match(world, /<CauldronOverlay[\s\S]*?onClick=\{\(\) => setCauldronOpen\(true\)\}/);
});

test("Mixing Tree brew controls and existing recipe modals share the HUD modal layer", () => {
  assert.match(world, /<ViewportModalPortal enabled=\{cauldronOpen\} blocking=\{false\}>\s*\{cauldronOpen && \(\s*<CauldronPanel/);
  assert.match(world, /<CauldronPanel[\s\S]*?onAdd=\{\(invId\) => addToCauldronMutation\.mutate\(invId\)\}/);
  assert.match(world, /onBrew=\{\(\) => brewMutation\.mutate\(\)\}/);
  assert.match(world, /onUnlockRecipe=\{\(inventoryId\) => unlockRecipeMutation\.mutate\(inventoryId\)\}/);
  assert.match(cauldron, /data-testid="button-brew-cauldron"/);
  assert.match(recipes, /<ViewportModalPortal>/);
});

test("Mixing Tree layer fix does not introduce old reference stage or affect other destination placement", () => {
  assert.match(world, /<ViewportScenePortal>/);
  assert.doesNotMatch(world, /<ViewportScenePortal enabled=\{!worldMapCameraBlocked\}>/);
  assert.match(world, /onCommit=\{\(layout\) => cauldronLayoutMutation\.mutate\(layout\)\}/);
});
