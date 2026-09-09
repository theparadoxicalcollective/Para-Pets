import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("catalog descriptions are stored and collected by the admin form", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const admin = read("client/src/components/ItemDatabaseSection.tsx");

  assert.match(schema, /description:\s*text\("description"\)/);
  assert.match(boot, /shop_items ADD COLUMN IF NOT EXISTS description TEXT/);
  assert.match(admin, /data-testid="input-item-description"/);
  assert.match(admin, /description:\s*description\.trim\(\) \|\| null/);
});

test("authored descriptions reach sale and owned-item cards", () => {
  const routes = read("server/routes.ts");
  const shop = read("client/src/components/world/WorldShopOverlay.tsx");
  const inventory = read("client/src/components/PetInventory.tsx");

  assert.match(routes, /description:\s*shopItem\?\.description \|\| null/);
  assert.match(shop, /item\.description\?\.trim\(\)/);
  assert.match(inventory, /if \(item\.description\?\.trim\(\)\) return item\.description\.trim\(\)/);
});

test("reward item images open the shared image, name, and description card", () => {
  const rewards = read("client/src/components/RewardClaimModal.tsx");
  const card = read("client/src/components/ItemDetailCard.tsx");

  assert.match(rewards, /button-reward-item-details/);
  assert.match(rewards, /<ItemDetailCard item=\{selectedItem\}/);
  assert.match(card, /item\.imageUrl/);
  assert.match(card, /\{item\.name\}/);
  assert.match(card, /text-item-description-card/);
});
