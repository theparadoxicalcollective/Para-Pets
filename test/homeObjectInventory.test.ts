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

test("admin item editor exposes Object as its own item type and category", () => {
  const source = read("client/src/components/ItemDatabaseSection.tsx");

  assert.match(source, /"decor", "object", "edibles"/);
  assert.match(source, /key: "objects",\s+label: "Objects"/);
  assert.match(source, /item\.type === "object"\) return "objects"/);
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
