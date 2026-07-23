import assert from "node:assert/strict";
import test from "node:test";
import { remainingQuantityAfterConsumption } from "../server/inventoryConsumption";

test("a book stack consumes one unit at a time and retains remaining copies", () => {
  assert.equal(remainingQuantityAfterConsumption(2), 1);
  assert.equal(remainingQuantityAfterConsumption(1), 0);
  assert.deepEqual([3, 2, 1].map((quantity) => remainingQuantityAfterConsumption(quantity)), [2, 1, 0]);
});

test("empty, invalid, and over-consumed stacks never produce a negative quantity", () => {
  assert.equal(remainingQuantityAfterConsumption(0), null);
  assert.equal(remainingQuantityAfterConsumption(1, 2), null);
  assert.equal(remainingQuantityAfterConsumption(-1), null);
  assert.equal(remainingQuantityAfterConsumption(2.5), null);
});

test("bulk food consumption retains the expected remainder", () => {
  assert.equal(remainingQuantityAfterConsumption(3, 1), 2);
  assert.equal(remainingQuantityAfterConsumption(3, 3), 0);
});
