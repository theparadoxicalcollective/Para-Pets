import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PET_MENU_ACTIONS,
  PET_MENU_HEIGHT,
  PET_MENU_WIDTH,
  petMenuBubbleLeft,
  positionPetActionMenu,
} from "../client/src/lib/petActionMenuGeometry";
import { petInventoryActionHref } from "../client/src/lib/petActionRoutes";

const read = (path: string) => readFileSync(path, "utf8");

test("four garden-style bubbles target all four existing pet pages by inventory ID", () => {
  assert.deepEqual(PET_MENU_ACTIONS.map(item => item.action),
    ["care", "levelUp", "powerUp", "closet"]);
  for (const entry of PET_MENU_ACTIONS) {
    assert.match(entry.label, /\S/);
    assert.match(petInventoryActionHref(entry.action, "pet-inventory-123"),
      /\/pet-inventory-123\?from=pets$/);
  }
  assert.equal(new Set(PET_MENU_ACTIONS.map(x => x.action)).size, 4);
});

test("arc opens inward on left and right pet cards and stays on a narrow phone", () => {
  for (const width of [320, 375, 390, 430, 768]) {
    const viewport = { width, height: 720 };
    const leftCard = positionPetActionMenu({ centerX: width * 0.25, top: 545, bottom: 580 }, viewport);
    const rightCard = positionPetActionMenu({ centerX: width * 0.75, top: 545, bottom: 580 }, viewport);
    assert.equal(leftCard.side, "right");
    assert.equal(rightCard.side, "left");
    assert.equal(leftCard.direction, "up");
    assert.equal(rightCard.direction, "up");
    for (const menu of [leftCard, rightCard]) {
      assert.ok(menu.left >= 8);
      assert.ok(menu.top >= 8);
      assert.ok(menu.left + PET_MENU_WIDTH <= width - 8);
      assert.ok(menu.top + PET_MENU_HEIGHT <= viewport.height - 8);
    }
  }
  assert.equal(petMenuBubbleLeft(0, "right"), 0);
  assert.equal(petMenuBubbleLeft(0, "left"), 146);
});

test("near-top pet buttons open downward and the arc stays within a tablet viewport", () => {
  const position = positionPetActionMenu(
    { centerX: 400, top: 90, bottom: 126 }, { width: 820, height: 1180 });
  assert.equal(position.direction, "down");
  assert.ok(position.top > 126);
  assert.ok(position.left >= 8);
  assert.ok(position.top + PET_MENU_HEIGHT <= 1180 - 8);
});

test("only a selected hatched pet opens in-card actions; eggs keep their separate hatch and speed-up flows", () => {
  const inventory = read("client/src/components/PetInventory.tsx");
  assert.match(inventory, /const hatchedPets = sortedPets\.filter\(pet => pet\.isHatched\)/);
  assert.match(inventory, /const petEggs = sortedPets\.filter\(pet => !pet\.isHatched\)/);
  assert.match(inventory, /\{!readOnly && \(/);
  assert.match(inventory, /data-testid=\{\`button-pet-menu-\$\{selectedPet\.inventoryId\}\`\}/);
  assert.match(inventory, /petInventoryId=\{selectedPet\.inventoryId\}/);
  assert.match(inventory, /<PetActionMenu inline/);
  assert.match(inventory, /navigate\(petInventoryActionHref\(action, inventoryId\)\)/);
  assert.doesNotMatch(inventory, /button-select-pet-/);
  assert.match(inventory, /hatchCheckMutation\.mutate\(pet\.inventoryId\)/);
  assert.match(inventory, /onEggSpeedUp\?\.\(pet\.inventoryId\)/);
  assert.match(inventory, /\/api\/pet\/\$\{petInvId\}\/use-special/);
});

test("one selected companion owns one anchored menu; changing portraits dismisses actions", () => {
  const inventory = read("client/src/components/PetInventory.tsx");
  assert.match(inventory, /const \[selectedPetId, setSelectedPetId\] = useState/);
  assert.match(inventory, /const \[openPetMenu, setOpenPetMenu\] = useState/);
  assert.match(inventory, /previous\?\.inventoryId === selectedPet\.inventoryId/);
  assert.match(inventory, /anchor: HTMLButtonElement/);
  assert.match(inventory, /hatchedPets\.find\(pet => pet\.inventoryId === selectedPetId\)/);
  assert.match(inventory, /closePetMenu\(\);\s*setFlippedPetId\(null\);\s*setSelectedPetId\(pet\.inventoryId\)/);
  assert.match(inventory, /data-testid="inventory-pets-eggs-divider"/);
});

test("menu portal avoids clipping, dismisses on scroll/outside/Escape, and does not block unrelated taps", () => {
  const menu = read("client/src/components/PetActionMenu.tsx");
  const styles = read("client/src/components/PetActionMenu.css");
  assert.match(menu, /<ViewportModalPortal blocking=\{false\}>/);
  assert.match(menu, /function InlinePetActionMenu/);
  assert.match(menu, /<InlinePetActionMenu \{\.\.\.props\} \/>/);
  assert.match(styles, /pet-action-inline-panel/);
  assert.match(menu, /pointer-events-none absolute inset-0/);
  assert.match(menu, /pet-action-bubble pointer-events-auto/);
  assert.match(menu, /event\.target\.closest\("\[data-pet-menu-trigger\]"\)/);
  assert.match(menu, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(menu, /document\.addEventListener\("scroll", onScroll, true\)/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /hud\.clientWidth|hud\?\.clientWidth/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(menu, /garden_tool|GardenPlayerAction|mutation\.mutate/);
});

test("legacy main pet can still be changed without restoring the large Select control", () => {
  const inventory = read("client/src/components/PetInventory.tsx");
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(inventory, /button-feature-main-pet-\$\{selectedPet\.inventoryId\}/);
  assert.match(inventory, /activePetId !== selectedPet\.inventoryId && !isPending\) onToggle\(selectedPet\.inventoryId\)/);
  assert.match(inventory, /PATCH", "\/api\/user\/active-pet"/);
  assert.match(home, /data-testid="active-pet-side-menu"/);
  assert.match(home, /data-testid="button-open-pet-menu"/);
});
