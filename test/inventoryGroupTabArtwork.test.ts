import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const groupTabs = source.split('data-testid="bag-group-tabs"')[1]?.split("{/* The category rail")[0] ?? "";
const categoryRail = source.split("{categoriesForActiveGroup.map(category => {")[1]?.split("</nav>")[0] ?? "";

test("the horizontal bag groups show one image before their labels", () => {
  assert.match(source, /const groupIcons: Record<GameItemGroupKey, string> = \{ pets: tabIconPet, fish: tabIconFish, home: tabIconHome, avatars: tabIconAccessory, items: tabIconPotion \}/);
  assert.match(groupTabs, /<img src=\{groupIcons\[group.key\]\}[^>]*\/>\s*<span>\{group.label\}<\/span>/);
  assert.match(groupTabs, /onClick=\{\(\) => \{ setBagGroup\(group.key\); setBagCategory\(null\); \}\}/);
});

test("vertical category buttons stay text-only, selectable, and counted", () => {
  assert.doesNotMatch(categoryRail, /<img|BAG_CATEGORY_ICONS/);
  assert.match(categoryRail, /onClick=\{\(\) => setBagCategory\(category\)\}/);
  assert.match(categoryRail, /GAME_ITEM_CATEGORY_LABELS\[category\]/);
  assert.match(categoryRail, /count > 0/);
});

test("group icons reuse existing assets without stage restrictions", () => {
  assert.match(source, /import tabIconPet from "@assets\/icon_pet_inventory.png"/);
  assert.match(source, /import tabIconFish from "@assets\/icon_fish_inventory.png"/);
  assert.match(source, /import tabIconHome from "@assets\/icon_home_inventory.png"/);
  assert.match(source, /import tabIconAccessory from "@assets\/acc_gem_amulet.png"/);
  assert.match(source, /import tabIconPotion from "@assets\/potion_health.png"/);
  assert.doesNotMatch(groupTabs + categoryRail, /390px|844px|390\\s*[×x]\\s*844|clientToStage/);
});
