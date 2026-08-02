import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care shelves retain effect labels and order items by their bar increase", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(page, /orderPetCareItemsByEffect\([\s\S]*?it\.type === "edibles"[\s\S]*?"edibles"/);
  assert.match(page, /orderPetCareItemsByEffect\([\s\S]*?it\.type === "gift"[\s\S]*?"gifts"/);
  assert.doesNotMatch(page, /pet-care-item-shelf__quantity/);
  assert.match(page, /pet-care-item-shelf__value--edible/);
  assert.match(page, /pet-care-item-shelf__value--gift/);
  assert.match(page, /onPointerDown=\{\(event\) => onItemPointerDown\(event, item\)\}/);
});
