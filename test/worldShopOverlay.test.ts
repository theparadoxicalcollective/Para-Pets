import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
const overlaySource = readFileSync("client/src/components/world/WorldShopOverlay.tsx", "utf8");

test("world shops render through one typed overlay boundary", () => {
  assert.equal((pageSource.match(/<WorldShopOverlay/g) ?? []).length, 1);
  assert.match(overlaySource, /interface WorldShopOverlayProps/);
  assert.match(pageSource, /location=\{locations\.find\(location => location\.id === activeLocationId\)\}/);
  assert.match(pageSource, /items=\{items\}/);
});

test("world-specific shop artwork and volcanic NPC presentation stay in the overlay", () => {
  for (const asset of [
    "bg_shop_mystical.webp", "bg_shop_bayou.png", "bg_shop_fishing.png",
    "bg_central_market.png", "bg_shop_volcanic.png", "bg_shop_volcanic_pets.png",
    "bg_shop_forge_fang_volcanic.png", "bg_shop_bookshop_volcanic.png",
    "bg_shop_food_volcanic.png", "bg_shop_food_swamp.png",
    "npc_lava_hook_shopkeeper.png",
  ]) assert.match(overlaySource, new RegExp(asset.replaceAll(".", "\\.")));
  assert.match(overlaySource, /worldId === "swamp"/);
  assert.match(overlaySource, /worldId === "volcanic"/);
});

test("loading, empty, selection, purchase, and role-gated admin controls remain presented", () => {
  assert.match(overlaySource, /itemsLoading \?/);
  assert.match(overlaySource, /No wares yet\./);
  assert.match(overlaySource, /setSelectedShopItem\(item\)/);
  assert.match(overlaySource, /onPurchase\(itemId, 1\)/);
  assert.match(overlaySource, /\{currentUser\.isAdmin && \(/);
  assert.match(overlaySource, /if \(currentUser\.isAdmin\) return/);
});

test("purchase request, payload, invalidations, and messages remain page-owned", () => {
  assert.match(pageSource, /apiRequest\("POST", `\/api\/shop\/\$\{worldId\}\/buy\/\$\{itemId\}`, \{ quantity \}\)/);
  assert.match(pageSource, /invalidateQueries\(\{ queryKey: \["\/api\/inventory"\] \}\)/);
  assert.match(pageSource, /invalidateQueries\(\{ queryKey: \["\/api\/auth\/me"\] \}\)/);
  assert.match(pageSource, /title: "Purchased!"/);
  assert.match(overlaySource, /"Could not purchase item"/);
});

test("shop close is explicit and neither navigates nor clears active location state", () => {
  const closeCallback = pageSource.slice(pageSource.indexOf("onClose={() => { setShowShop(false)"), pageSource.indexOf("/>\n      )}", pageSource.indexOf("onClose={() => { setShowShop(false)")));
  assert.match(closeCallback, /setShowShop\(false\)/);
  assert.doesNotMatch(closeCallback, /navigate|setActiveLocationId|setFishingLocation/);
  assert.match(overlaySource, /data-testid="button-close-shop"/);
});
