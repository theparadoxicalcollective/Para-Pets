import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const market = readFileSync("client/src/pages/MarketPage.tsx", "utf8");

test("Player Market keeps interactive content on the canonical stage", () => {
  assert.match(market, /data-stage-coordinate-space="canonical"/);
  assert.doesNotMatch(market, /maxWidth: 760/);
  assert.match(market, /className="market-shell"[\s\S]*?height: "100dvh"/);
  assert.match(market, /className="market-listing-grid"/);
  assert.match(market, /className="market-filter-tabs"/);
});

test("Player Market uses its own artwork for the expanded device backdrop", () => {
  assert.match(market, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(market, /<ViewportBackdropPortal>/);
  assert.match(market, /data-testid="market-viewport-backdrop"/);
  assert.match(market, /url\(\$\{marketBg\}\)/);
  assert.match(market, /backgroundPosition: "center top"/);
  assert.match(market, /backgroundSize: "cover"/);
});

test("blocking Market dialogs use the shared viewport modal layer", () => {
  assert.match(market, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.ok((market.match(/<ViewportModalPortal>/g) ?? []).length >= 3);
  assert.doesNotMatch(market, /position: "fixed"/);

  assert.match(market, /showSellModal[\s\S]*?<ViewportModalPortal>[\s\S]*?<SellItemModal/);
  assert.match(market, /detailTarget\?\.itemType === "pet_egg"[\s\S]*?<ViewportModalPortal>[\s\S]*?<PetEggDetailModal/);
  assert.match(market, /detailTarget && detailTarget\.itemType !== "pet_egg"[\s\S]*?<ViewportModalPortal>[\s\S]*?<ItemDetailModal/);
});

test("nested pet listing confirmation stays above the sell dialog without changing submission behavior", () => {
  assert.match(market, /function PetListingConfirmModal[\s\S]*position: "absolute", inset: 0, zIndex: 400/);
  assert.match(market, /function SellItemModal[\s\S]*position: "absolute", inset: 0, zIndex: 300/);
  assert.match(market, /showPetConfirm && selectedPet[\s\S]*<PetListingConfirmModal/);
  assert.match(market, /onConfirm=\{\(\) => \{ if \(valid\) onSubmitPet\(selectedPet\.id, priceNum\); \}\}/);
});

test("Market transaction endpoints and card artwork ownership remain unchanged", () => {
  assert.match(market, /apiRequest\("POST", "\/api\/market\/list-pet", \{ inventoryId, price \}\)/);
  assert.match(market, /data-market-card-field="pet-rarity"/);
  assert.match(market, /data-market-card-field="item-image"/);
  assert.match(market, /data-testid="market-search-frame"/);
});
