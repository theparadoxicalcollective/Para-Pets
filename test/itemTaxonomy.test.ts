import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GAME_ITEM_CATEGORY_LABELS,
  GAME_ITEM_CATEGORY_ORDER,
  GAME_ITEM_GROUPS,
  gameItemCategoriesForGroup,
  getGameItemCategory,
  getGameItemGroup,
} from "../shared/itemTaxonomy";

const read = (path: string) => readFileSync(path, "utf8");

test("shared item taxonomy follows Pets, Fish, Home, Items in the requested order", () => {
  assert.deepEqual(
    GAME_ITEM_GROUPS.map(group => [group.key, group.label, [...group.categories]]),
    [
      ["pets", "Pets", ["pets", "mini_pets", "costumes", "accessories"]],
      ["fish", "Fish", ["fish", "poles", "bait"]],
      ["home", "Home", ["objects", "decor", "homes"]],
      ["items", "Items", ["potions", "power_ups", "specials", "edibles", "gifts", "ingredients", "recipes", "clearing"]],
    ],
  );
  assert.equal(GAME_ITEM_CATEGORY_LABELS.costumes, "Adornments");
  assert.equal(GAME_ITEM_CATEGORY_LABELS.clearing, "Clearing Equipment");
  assert.equal(GAME_ITEM_CATEGORY_LABELS.homes, "Homes");
  assert.deepEqual(GAME_ITEM_CATEGORY_ORDER, GAME_ITEM_GROUPS.flatMap(group => [...group.categories]));
});

test("stored shop types and virtual fishing/home asset types classify consistently", () => {
  assert.equal(getGameItemCategory({ type: "pet" }), "pets");
  assert.equal(getGameItemCategory({ itemType: "pet_egg" }), "pets");
  assert.equal(getGameItemCategory({ type: "mini_pet" }), "mini_pets");
  assert.equal(getGameItemCategory({ type: "costume" }), "costumes");
  assert.equal(getGameItemCategory({ type: "accessory" }), "accessories");

  assert.equal(getGameItemCategory({ type: "fishing", fishingType: "fish" }), "fish");
  assert.equal(getGameItemCategory({ type: "fishing", fishingType: "pole" }), "poles");
  assert.equal(getGameItemCategory({ itemType: "bait" }), "bait");

  assert.equal(getGameItemCategory({ type: "object" }), "objects");
  assert.equal(getGameItemCategory({ assetKind: "home_decor" }), "decor");
  assert.equal(getGameItemCategory({ assetKind: "home_bundle" }), "homes");

  assert.equal(getGameItemCategory({ type: "potion" }), "potions");
  assert.equal(getGameItemCategory({ type: "item" }), "power_ups");
  assert.equal(getGameItemCategory({ type: "power_up" }), "power_ups");
  assert.equal(getGameItemCategory({ type: "special" }), "specials");
  assert.equal(getGameItemCategory({ type: "edibles" }), "edibles");
  assert.equal(getGameItemCategory({ type: "gift" }), "gifts");
  assert.equal(getGameItemCategory({ type: "ingredient" }), "ingredients");
  assert.equal(getGameItemCategory({ type: "recipe" }), "recipes");
  assert.equal(getGameItemCategory({ type: "clearing" }), "clearing");

  assert.equal(getGameItemGroup("objects"), "home");
  assert.deepEqual(gameItemCategoriesForGroup("fish"), ["fish", "poles", "bait"]);
});

test("Bag inventory uses the shared groups and merges owned Decor and Homes without duplicating Objects", () => {
  const bag = read("client/src/components/PetInventory.tsx");

  assert.match(bag, /GAME_ITEM_GROUPS\.map/);
  assert.match(bag, /button-bag-group-\$\{group\.key\}/);
  assert.match(bag, /gameItemCategoriesForGroup\(bagGroup\)/);
  assert.match(bag, /getGameItemCategory\(\{ type: item\.type, fishingType: item\.fishingType \}\)/);
  assert.match(bag, /queryKey: \["\/api\/pet-house\/decor\/inventory"\]/);
  assert.match(bag, /\/api\/users\/\$\{userId\}\/house-bundles/);
  assert.match(bag, /filter\(entry => entry\.item\?\.type === "decor"\)/);
  assert.match(bag, /category: "decor"/);
  assert.match(bag, /category: "homes"/);
  assert.match(bag, /Full Pets are managed in the Pet Companions inventory/);
  assert.doesNotMatch(bag, /itemTypeOptions\(/);
});

test("generic Admin reward picker and shop item browser share the same hierarchy", () => {
  const editor = read("client/src/components/ItemDatabaseSection.tsx");

  assert.match(editor, /data-testid="item-picker-group-tabs"/);
  assert.match(editor, /button-item-group-\$\{group\.key\}/);
  assert.match(editor, /button-item-category-\$\{category\}/);
  assert.match(editor, /gameItemCategoriesForGroup\(activeGroup\)/);
  assert.match(editor, /activeCategory === "homes"/);
  assert.match(editor, /activeCategory === "decor"/);
  assert.match(editor, /data-testid="row-filter-tabs"/);
  assert.match(editor, /tab-filter-group-\$\{group\.key\}/);
  assert.match(editor, /GAME_ITEM_CATEGORY_LABELS\[category\]/);
});

test("generic reward editor still supplies Home bundles and Home decor to the organized picker", () => {
  const admin = read("client/src/pages/AdminPage.tsx");

  assert.match(admin, /homeBundles=\{rewardHouseBundles/);
  assert.match(admin, /homeDecor=\{rewardHomeDecor\}/);
  assert.match(admin, /onSelectHomeBundle=/);
  assert.match(admin, /onSelectHomeDecor=/);
});
