import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPetCareInventoryStacks } from "../client/src/lib/petCareInventory";

test("stack presentation cannot become a bulk Pet Care action", () => {
  const [stack] = buildPetCareInventoryStacks([{
    id: "inventory-edible",
    shopItemId: "item-apple",
    type: "edibles",
    quantity: 30,
  }]);

  assert.equal(stack.displayQuantity, 30);
  assert.equal(stack.quantity, 1);
});

test("an edible session can be followed immediately by a gift session", () => {
  const controllerSource = readFileSync("client/src/lib/petCareInteractions.ts", "utf8");
  const inventorySource = readFileSync("client/src/lib/petCareInventory.ts", "utf8");
  const polishSource = readFileSync("client/src/petCarePolish.ts", "utf8");

  assert.match(controllerSource, /consume\(pointerId: number\)[\s\S]*?active = null/);
  assert.match(controllerSource, /cancel\(\) \{ active = null; \}/);
  assert.match(inventorySource, /displayQuantity:/);
  assert.match(inventorySource, /quantity: 1 as const/);
  assert.match(polishSource, /displayQuantity \?\? stacks\[index\]\?\.quantity/);
});

test("Pet Care still uses the existing server-safe one-item mutations", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(page, /feedMutation\.mutateAsync\(\{ itemInventoryId: drag\.inventoryId \}\)/);
  assert.match(page, /giftMutation\.mutateAsync\(\{ itemInventoryId: drag\.inventoryId \}\)/);
  assert.match(page, /cleanupItemGesture\(\);\s*void applyCareItem\(d\)/);
});
