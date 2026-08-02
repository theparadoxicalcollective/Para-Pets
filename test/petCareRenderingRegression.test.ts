import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("post-Clearing and animation changes retain Pet Care stacking and shelf labels", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(page, /buildPetCareInventoryStacks\(inventory\.filter\(\(it\) => it\.type === "edibles"\)\)/);
  assert.match(page, /buildPetCareInventoryStacks\(inventory\.filter\(\(it\) => it\.type === "gift"\)\)/);
  assert.match(page, /<span className="pet-care-item-shelf__quantity">\{item\.quantity \?\? 1\}<\/span>/);
  assert.match(page, /pet-care-item-shelf__value--edible/);
  assert.match(page, /pet-care-item-shelf__value--gift/);
  assert.match(page, /onPointerDown=\{\(event\) => onItemPointerDown\(event, item\)\}/);
});
