import assert from "node:assert/strict";
import test from "node:test";
import { buildPetCareInventoryStacks, orderPetCareItemsByEffect } from "../client/src/lib/petCareInventory";

const item = (quantity: number, overrides = {}) => ({
  id: "inventory-row-a",
  shopItemId: "definition-apple",
  quantity,
  ...overrides,
});

test("pet care display quantities stay in one slot through the stack limit", () => {
  const two = buildPetCareInventoryStacks([item(2)]);
  const thirty = buildPetCareInventoryStacks([item(30)]);

  assert.deepEqual(two.map(({ displayQuantity }) => displayQuantity), [2]);
  assert.deepEqual(thirty.map(({ displayQuantity }) => displayQuantity), [30]);
  assert.deepEqual(two.map(({ quantity }) => quantity), [1]);
  assert.deepEqual(thirty.map(({ quantity }) => quantity), [1]);
});

test("pet care quantities above 30 flow into stable additional slots", () => {
  const stacks = buildPetCareInventoryStacks([item(31)]);
  assert.deepEqual(stacks.map(({ displayQuantity }) => displayQuantity), [30, 1]);
  assert.deepEqual(stacks.map(({ quantity }) => quantity), [1, 1]);
  assert.deepEqual(stacks.map(({ stackId }) => stackId), [
    "definition-apple:inventory-row-a:0",
    "definition-apple:inventory-row-a:1",
  ]);
});

test("pet care quantities 30, 31, and 65 split into visible stacks of at most 30", () => {
  assert.deepEqual(buildPetCareInventoryStacks([item(30)]).map(({ displayQuantity }) => displayQuantity), [30]);
  assert.deepEqual(buildPetCareInventoryStacks([item(31)]).map(({ displayQuantity }) => displayQuantity), [30, 1]);
  assert.deepEqual(buildPetCareInventoryStacks([item(65)]).map(({ displayQuantity }) => displayQuantity), [30, 30, 5]);
});

test("gifts use individual shelf slots instead of display stacks", () => {
  const gifts = buildPetCareInventoryStacks([item(3, {
    type: "gift",
    shopItemId: "definition-gift",
  })]);

  assert.deepEqual(gifts.map(({ displayQuantity }) => displayQuantity), [1, 1, 1]);
  assert.deepEqual(gifts.map(({ quantity }) => quantity), [1, 1, 1]);
  assert.deepEqual(gifts.map(({ stackId }) => stackId), [
    "definition-gift:inventory-row-a:0",
    "definition-gift:inventory-row-a:1",
    "definition-gift:inventory-row-a:2",
  ]);
});

test("a stacked edible drag and the following gift drag both represent one use", () => {
  const [edible] = buildPetCareInventoryStacks([item(30, { type: "edibles" })]);
  const [gift] = buildPetCareInventoryStacks([item(1, {
    id: "inventory-gift-a",
    shopItemId: "definition-gift",
    type: "gift",
  })]);

  assert.equal(edible.displayQuantity, 30);
  assert.equal(edible.quantity, 1);
  assert.equal(gift.displayQuantity, 1);
  assert.equal(gift.quantity, 1);
});

test("different item definitions and persisted rows remain distinct", () => {
  const stacks = buildPetCareInventoryStacks([
    item(2),
    item(3, { id: "inventory-row-b", shopItemId: "definition-berry" }),
  ]);
  assert.deepEqual(stacks.map(({ shopItemId, displayQuantity, quantity }) => [shopItemId, displayQuantity, quantity]), [
    ["definition-apple", 2, 1],
    ["definition-berry", 3, 1],
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
