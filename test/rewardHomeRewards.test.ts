import assert from "node:assert/strict";
import test from "node:test";
import { parseHomeRewards } from "../server/rewardHomeRewards";

test("home reward parser accepts Home Bundles and Home Decor", () => {
  assert.deepEqual(
    parseHomeRewards([
      { type: "house_bundle", id: "bundle-1", quantity: 12 },
      { type: "home_decor", id: "decor-1", quantity: 4 },
    ]),
    [
      { type: "house_bundle", id: "bundle-1", quantity: 1 },
      { type: "home_decor", id: "decor-1", quantity: 4 },
    ],
  );
});

test("home reward parser aggregates duplicate decor and de-duplicates bundles", () => {
  assert.deepEqual(
    parseHomeRewards([
      { type: "home_decor", id: "decor-1", quantity: 2 },
      { type: "home_decor", id: "decor-1", quantity: 3 },
      { type: "house_bundle", id: "bundle-1" },
      { type: "house_bundle", id: "bundle-1", quantity: 9 },
    ]),
    [
      { type: "home_decor", id: "decor-1", quantity: 5 },
      { type: "house_bundle", id: "bundle-1", quantity: 1 },
    ],
  );
});

test("home reward parser trims ids and defaults quantity to one", () => {
  assert.deepEqual(
    parseHomeRewards([{ type: "home_decor", id: "  decor-1  " }]),
    [{ type: "home_decor", id: "decor-1", quantity: 1 }],
  );
  assert.deepEqual(parseHomeRewards(undefined), []);
  assert.deepEqual(parseHomeRewards(null), []);
});

test("home reward parser rejects malformed types, ids, quantities, and oversized aggregation", () => {
  const invalid: unknown[] = [
    {},
    "decor",
    [{ type: "other", id: "x" }],
    [{ type: "home_decor", id: "" }],
    [{ type: "home_decor", id: "x", quantity: 0 }],
    [{ type: "home_decor", id: "x", quantity: 1000 }],
    [{ type: "home_decor", id: "x", quantity: 1.5 }],
  ];

  for (const value of invalid) {
    assert.throws(() => parseHomeRewards(value));
  }

  assert.throws(() =>
    parseHomeRewards([
      { type: "home_decor", id: "x", quantity: 700 },
      { type: "home_decor", id: "x", quantity: 400 },
    ]),
  );
});
