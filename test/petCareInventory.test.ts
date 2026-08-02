import assert from "node:assert/strict";
import test from "node:test";
import { buildPetCareInventoryStacks, orderPetCareItemsByEffect } from "../client/src/lib/petCareInventory";

const item = (quantity: number, overrides = {}) => ({
  id: "inventory-row-a",
  shopItemId: "definition-apple",
  quantity,
  ...overrides,
});

test("pet care quantities stay in one slot through the stack limit", () => {
  assert.deepEqual(buildPetCareInventoryStacks([item(2)]).map(({ quantity }) => quantity), [2]);
  assert.deepEqual(buildPetCareInventoryStacks([item(30)]).map(({ quantity }) => quantity), [30]);
});

test("pet care quantities above 30 flow into stable additional slots", () => {
  const stacks = buildPetCareInventoryStacks([item(31)]);
  assert.deepEqual(stacks.map(({ quantity }) => quantity), [30, 1]);
  assert.deepEqual(stacks.map(({ stackId }) => stackId), [
    "definition-apple:inventory-row-a:0",
    "definition-apple:inventory-row-a:1",
  ]);
});

test("pet care quantities 30, 31, and 65 split into visible stacks of at most 30", () => {
  assert.deepEqual(buildPetCareInventoryStacks([item(30)]).map(({ quantity }) => quantity), [30]);
  assert.deepEqual(buildPetCareInventoryStacks([item(31)]).map(({ quantity }) => quantity), [30, 1]);
  assert.deepEqual(buildPetCareInventoryStacks([item(65)]).map(({ quantity }) => quantity), [30, 30, 5]);
});

test("different item definitions and persisted rows remain distinct", () => {
  const stacks = buildPetCareInventoryStacks([
    item(2),
    item(3, { id: "inventory-row-b", shopItemId: "definition-berry" }),
  ]);
  assert.deepEqual(stacks.map(({ shopItemId, quantity }) => [shopItemId, quantity]), [
    ["definition-apple", 2],
    ["definition-berry", 3],
  ]);
});

test("pet care items are ordered by the amount they add to the relevant bar", () => {
  const items = [
    { name: "large", statBoostAmount: 30, giftPoints: 20 },
    { name: "small", statBoostAmount: 5, giftPoints: 40 },
    { name: "medium", statBoostAmount: 10, giftPoints: 10 },
  ];

  assert.deepEqual(orderPetCareItemsByEffect(items, "edibles").map(({ name }) => name), [
    "small",
    "medium",
    "large",
  ]);
  assert.deepEqual(orderPetCareItemsByEffect(items, "gifts").map(({ name }) => name), [
    "medium",
    "large",
    "small",
  ]);
  assert.deepEqual(items.map(({ name }) => name), ["large", "small", "medium"]);
});

test("items without a bar increase appear after items with a known value", () => {
  const items = [
    { name: "unknown", statBoostAmount: null },
    { name: "known", statBoostAmount: 5 },
  ];

  assert.deepEqual(orderPetCareItemsByEffect(items, "edibles").map(({ name }) => name), [
    "known",
    "unknown",
  ]);
});
