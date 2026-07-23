import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const storageSource = await readFile(new URL("../server/storage.ts", import.meta.url), "utf8");
const routesSource = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");

test("durable poles remain individual inventory records and only the selected record can be depleted", () => {
  assert.match(storageSource, /const isDurablePole = shopItem\?\.type === "fishing" && shopItem\.fishingType === "pole"/);
  assert.match(storageSource, /shopItem\.type !== "pet" && !isDurablePole/);
  assert.match(storageSource, /eq\(userInventory\.id, inventoryId\),[\s\S]*eq\(userInventory\.userId, userId\)/);
  assert.match(storageSource, /tx\.delete\(userInventory\)\.where\(and\(eq\(userInventory\.id, inventoryId\), eq\(userInventory\.userId, userId\)\)\)/);
});

test("multi-quantity purchases validate exact whole quantities and compensate a failed grant", () => {
  assert.match(routesSource, /Number\.isSafeInteger\(quantity\) \|\| quantity < 1 \|\| quantity > 20/);
  assert.match(routesSource, /baitChargesPerPurchase \* purchaseCount/);
  assert.match(routesSource, /addStackingItem\(user\.id, itemId, purchaseCount, POTION_STACK_LIMIT\)/);
  assert.match(routesSource, /await storage\.addCoins\(user\.id, totalCost\);[\s\S]*throw grantError/);
});

test("stacked generic items increment rather than overwrite their existing quantity", () => {
  assert.match(storageSource, /quantity: sql`COALESCE\(\$\{userInventory\.quantity\}, 0\) \+ 1`/);
  assert.doesNotMatch(storageSource, /set\(\{ quantity: 1 \}\)\s*\.where\(eq\(userInventory\.id, existing\.id\)\)/);
});
