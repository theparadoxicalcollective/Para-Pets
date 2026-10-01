import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("WorldPage delegates pond stocking UI to the extracted modal", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /import PondAdminModal from "@\/components\/world\/PondAdminModal"/,
  );
  assert.match(worldPage, /showPondAdmin && activeLocationId/);
  assert.match(worldPage, /<PondAdminModal/);
  assert.match(worldPage, /locationId=\{activeLocationId\}/);
  assert.match(worldPage, /accent="#60a5fa"/);
  assert.match(worldPage, /onClose=\{\(\) => setShowPondAdmin\(false\)\}/);

  assert.doesNotMatch(worldPage, /function PondAdminModal/);
  assert.doesNotMatch(worldPage, /interface PondFishEntry/);
  assert.doesNotMatch(worldPage, /interface FishingShopItem/);
  assert.doesNotMatch(worldPage, /fishCommonIconWp/);
});

test("pond admin modal preserves the same stocking query and mutation contracts", () => {
  const modal = read("client/src/components/world/PondAdminModal.tsx");

  assert.match(modal, /queryKey: \["\/api\/admin\/location", locationId, "pond-fish"\]/);
  assert.match(modal, /\/api\/admin\/location\/\$\{locationId\}\/pond-fish/);
  assert.match(modal, /queryKey: \["\/api\/admin\/shop-items-all"\]/);
  assert.match(modal, /item\.type === "fishing" && item\.fishingType === "fish"/);
  assert.match(modal, /apiRequest\([\s\S]*?"POST"[\s\S]*?pond-fish[\s\S]*?\{ shopItemId \}/);
  assert.match(modal, /"DELETE"[\s\S]*?pond-fish\/\$\{shopItemId\}/);
});

test("pond admin modal preserves admin controls and test ids", () => {
  const modal = read("client/src/components/world/PondAdminModal.tsx");

  for (const marker of [
    "button-close-pond-admin",
    "button-add-fish-to-pond",
    "pond-fish-entry-",
    "button-remove-pond-fish-",
    "button-pick-pond-fish-",
    "Pond Stocking",
    "Pond is empty — stock some fish!",
    "All fish already stocked or none created yet",
  ]) {
    assert.equal(modal.includes(marker), true, marker);
  }

  assert.match(modal, /disabled=\{removeMutation\.isPending\}/);
  assert.match(modal, /disabled=\{addMutation\.isPending\}/);
  assert.match(modal, /setShowPicker\(false\)/);
});
