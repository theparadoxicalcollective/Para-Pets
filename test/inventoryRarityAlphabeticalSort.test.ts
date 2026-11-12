import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareInventoryByRarityThenName } from "../client/src/lib/inventorySort";

test("unstarred inventory and categories remain alphabetical A–Z", () => {
  const items=[
    {name:"Zesty Potion",shopItemId:"z"},
    {name:"Apple Potion",shopItemId:"a"},
    {name:"Item 10",shopItemId:"i10"},
    {name:"Item 2",shopItemId:"i2"},
  ];
  const sorted=[...items].sort(compareInventoryByRarityThenName);
  assert.deepEqual(sorted.map(x=>x.name),["Apple Potion","Item 2","Item 10","Zesty Potion"]);
  assert.equal(items[0].name,"Zesty Potion","input array is not changed");
});
test("Mini Pets and other starred items sort rarity descending then name ascending", () => {
  const mini=[
    {name:"Clover",rarity:1},{name:"Zebra",rarity:5},
    {name:"Blue",rarity:3},{name:"Amber",rarity:5},
    {name:"Unranked",rarity:null},
  ];
  assert.deepEqual([...mini].sort(compareInventoryByRarityThenName).map(x=>x.name),
    ["Amber","Zebra","Blue","Clover","Unranked"]);
});
test("pet nickname is the alphabetical label and pet level is never a tie breaker", () => {
  const pets=[
    {name:"Wolf",petNickname:"Zed",rarity:4,inventoryId:"b"},
    {name:"Bear",petNickname:"Ada",rarity:4,inventoryId:"c"},
    {name:"Fawn",petNickname:null,rarity:4,inventoryId:"a"},
  ];
  assert.deepEqual([...pets].sort(compareInventoryByRarityThenName).map(x=>x.inventoryId),
    ["c","a","b"]);
});
test("duplicate labels retain deterministic IDs and bad rarity becomes unstarred", () => {
  const entries=[
    {name:"Same",rarity:NaN,inventoryId:"b"},
    {name:"Same",rarity:null,inventoryId:"a"},
  ];
  assert.deepEqual([...entries].sort(compareInventoryByRarityThenName).map(x=>x.inventoryId),
    ["a","b"]);
});
test("the existing Bag and Pet views consistently use the presentation comparator", () => {
  const source=readFileSync("client/src/components/PetInventory.tsx","utf8");
  assert.match(source,/const sortedPets = \[\.\.\.pets\]\.sort\(compareInventoryByRarityThenName\)/);
  assert.match(source,/\.sort\(\(a, b\) => compareInventoryByRarityThenName\(a\.item, b\.item\)\)/);
  assert.match(source,/\.sort\(compareInventoryByRarityThenName\);/);
  assert.match(source,/\{\[\.\.\.pets\]\.sort\(compareInventoryByRarityThenName\)\.map\(pet =>/);
});
