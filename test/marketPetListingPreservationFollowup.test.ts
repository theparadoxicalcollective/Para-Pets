import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("server/marketplace/transactions.ts", "utf8");
const bridge = readFileSync("client/src/components/MarketPetListingCopyBridge.tsx", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

test("hatched market pets keep hatch state and stats", () => {
  assert.match(service, /tx\.update\(userInventory\)\.set\(\{ isListed: true \}\)/);
  assert.doesNotMatch(service, /isListed: true, isHatched: false, hatchStartedAt: null/);
  assert.match(service, /inventory\.isHatched[\s\S]*?item\.hatchedImageUrl[\s\S]*?item\.eggImageUrl/);
  assert.match(service, /isHatched: escrow\.isHatched/);
});

test("listing a pet removes accessory and adornment equipment links", () => {
  const start = service.indexOf("const listingPet =");
  const end = service.indexOf("const updated =", start);
  const block = service.slice(start, end);
  assert.match(block, /tx\.delete\(petEquippedAccessories\)[\s\S]*?petInventoryId, inventory\.id/);
  assert.match(block, /tx\.delete\(petEquippedCostumes\)[\s\S]*?petInventoryId, inventory\.id/);
  assert.doesNotMatch(block, /tx\.delete\(userInventory\)/);
});

test("true eggs still use the existing egg hatch-start path", () => {
  const matches = service.match(/const isUnhatchedPet = listing\.itemType === "pet_egg" && !escrow\.isHatched/g) ?? [];
  assert.equal(matches.length, 2);
});

test("player-facing confirmation says the pet stays hatched", () => {
  assert.match(bridge, /List Hatched Pet/);
  assert.match(bridge, /stay hatched and keep its current stats/);
  assert.match(bridge, /accessories and adornments will be unequipped/);
  assert.match(bridge, /List Pet/);
  assert.match(main, /<MarketPetListingCopyBridge \/>/);
});
