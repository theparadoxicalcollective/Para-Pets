import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("server/marketplace/transactions.ts", "utf8");
const bridge = readFileSync("client/src/components/MarketPetListingCopyBridge.tsx", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

test("hatched market pets stay hatched, preserve stats, and use hatched art", () => {
  assert.match(service, /tx\.update\(userInventory\)\.set\(\{ isListed: true \}\)/);
  assert.doesNotMatch(service, /isListed: true, isHatched: false, hatchStartedAt: null/);
  assert.match(service, /inventory\.isHatched[\s\S]*?item\.hatchedImageUrl[\s\S]*?item\.eggImageUrl/);
  assert.match(service, /isHatched: escrow\.isHatched/);
  assert.doesNotMatch(service, /petLevel:\s*(?:0|1|null)|petHealth:\s*(?:0|null)|petAtk:\s*(?:0|null)|petDef:\s*(?:0|null)/);
});

test("listing a pet unequips both accessories and adornments without deleting owned gear", () => {
  const listingBlock = service.slice(
    service.indexOf("const listingPet ="),
    service.indexOf("const updated =", service.indexOf("const listingPet =")),
  );
  assert.match(listingBlock, /tx\.delete\(petEquippedAccessories\)[\s\S]*?petInventoryId, inventory\.id/);
  assert.match(listingBlock, /tx\.delete\(petEquippedCostumes\)[\s\S]*?petInventoryId, inventory\.id/);
  assert.doesNotMatch(listingBlock, /tx\.delete\(userInventory\)/);
});

test("true eggs keep their existing hatch-start behavior", () => {
  const matches = service.match(/const isUnhatchedPet = listing\.itemType === "pet_egg" && !escrow\.isHatched/g) ?? [];
  assert.equal(matches.length, 2);
  assert.match(service, /hatchStartedAt: isUnhatchedPet \? new Date\(\) : escrow\.hatchStartedAt/);
});

test("player-facing market confirmation no longer tells hatched pets to revert to eggs", () => {
  assert.match(bridge, /List Hatched Pet/);
  assert.match(bridge, /stay hatched and keep its current stats/);
  assert.match(bridge, /accessories and adornments will be unequipped/);
  assert.match(bridge, /List Pet/);
  assert.match(main, /<MarketPetListingCopyBridge \/>/);
});
