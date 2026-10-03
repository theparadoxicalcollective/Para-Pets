import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  homeSceneItemCountsTowardDecorLimit,
  type HomeSceneItemType,
} from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

test("Objects do not consume home decor capacity while Decor still does", () => {
  assert.equal(homeSceneItemCountsTowardDecorLimit("decor"), true);
  assert.equal(homeSceneItemCountsTowardDecorLimit("object"), false);
  const types: HomeSceneItemType[] = ["decor", "object"];
  assert.deepEqual(types.filter(homeSceneItemCountsTowardDecorLimit), ["decor"]);
});

test("admin item editor exposes Object through the shared Home taxonomy", () => {
  const source = read("client/src/components/ItemDatabaseSection.tsx");
  const taxonomy = read("shared/itemTaxonomy.ts");

  assert.match(source, /GAME_ITEM_GROUPS/);
  assert.match(source, /getGameItemCategory/);
  assert.match(source, /data-testid=\{`tab-filter-group-\$\{group\.key\}`\}/);
  assert.match(taxonomy, /categories: \["objects", "decor", "homes"\]/);
  assert.match(taxonomy, /objects: "Objects"/);
  assert.match(taxonomy, /rawType === "object"/);
  assert.equal(source.includes("Objects are home-scene items and do not count toward home decor limits."), true);
});

test("home inventory combines legacy Decor with owned Object shop items", () => {
  const storage = read("server/storage.ts");
  const transactions = read("server/housing/decorTransactions.ts");

  assert.match(storage, /eq\(shopItems\.type, "object"\)/);
  assert.match(storage, /type: "decor"/);
  assert.match(storage, /type: "object"/);
  assert.match(storage, /decorItemId: userInventory\.shopItemId/);

  assert.match(transactions, /eq\(shopItems\.type, "object"\)/);
  assert.match(transactions, /from\(userInventory\)/);
  assert.match(transactions, /eq\(userInventory\.isListed, false\)/);
  assert.match(transactions, /insert\(userInventory\)\.values\(\{ userId, shopItemId: placement\.decorItemId, quantity: 1 \}\)/);
});

test("Pet House divides Decor and Objects and only applies limits to Decor", () => {
  const source = read("client/src/pages/PetHousePage.tsx");

  assert.equal(source.includes('label: "Decor", note: "Counts toward this home\'s decor limit"'), true);
  assert.equal(source.includes('label: "Objects", note: "Unlimited in the home scene"'), true);
  assert.match(source, /home-inventory-section-\$\{section\.type\}/);
  assert.match(source, /homeSceneItemCountsTowardDecorLimit\(decorDrag\.itemType\)/);
  assert.match(source, /placedDecorRaw\.filter\(item => homeSceneItemCountsTowardDecorLimit\(item\.item\.type\)\)\.length/);
  assert.match(source, /interiorPlacedRaw\.filter\(item => homeSceneItemCountsTowardDecorLimit\(item\.item\.type\)\)\.length/);
});

test("Pet House uses the newly uploaded FriendsIcon asset", () => {
  const source = read("client/src/pages/PetHousePage.tsx");

  assert.match(source, /import friendsNavIcon from "@assets\/uploads\/FriendIcon\.png"/);
  assert.match(source, /label: "Friends"[\s\S]*?src=\{friendsNavIcon\}/);
});
