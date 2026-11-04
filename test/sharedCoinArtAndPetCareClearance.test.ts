import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(p, "utf8");

test("uploaded coin is the single shared currency default without changing the essence art", () => {
  const shared = read("client/src/lib/currencyAssets.ts");
  const uploaded = read("client/src/lib/coinAssets.ts");
  assert.match(uploaded, /@assets\/uploads\/MainGameCoinImage\.PNG\?url/);
  assert.ok(statSync("attached_assets/uploads/MainGameCoinImage.PNG").size > 1024);
  assert.match(shared, /import \{ PARA_PETS_COIN_IMAGE \} from "@\/lib\/coinAssets"/);
  assert.match(shared, /coin: PARA_PETS_COIN_IMAGE/);
  assert.doesNotMatch(shared, /@assets\/icon_coin\.webp/);
  assert.match(shared, /essenceToken/);
  assert.match(shared, /essenceBar/);
});

test("Pet Care, Fishing and Sell Fish all show the uploaded coin without changing reward behavior", () => {
  const petCare = read("client/src/features/pet-care/FeedingOverlay.tsx");
  const fishing = read("client/src/pages/FishingPage.tsx");
  const sell = read("client/src/pages/SellFishPage.tsx");

  assert.match(petCare, /const coinIconImg = currencyAssets\.coin/);
  assert.match(petCare, /src=\{coinIconImg\}/);
  assert.match(petCare, /collectCoin\(c\.id\)/);
  assert.match(petCare, /spawnRewardCoins\(data\.amount\)/);

  for (const source of [fishing, sell]) {
    assert.match(source, /import \{ PARA_PETS_COIN_IMAGE as coinIconImg \} from "@\/lib\/coinAssets"/);
    assert.match(source, /src=\{coinIconImg\}/);
    assert.doesNotMatch(source, /@assets\/icon_coin\.webp/);
  }
  assert.match(fishing, /claimRewardMutation\.mutate\(fish\.id\)/);
});

test("casino, mini-game prizes and clearing drops use the same image while retaining configured rewards", () => {
  const bingo = read("client/src/components/world/HauntedBingoOverlay.tsx");
  const slots = read("client/src/components/world/SlaughterSlotsOverlay.tsx");
  const wheel = read("client/src/components/world/BeauPrizeWheelOverlay.tsx");
  const strip = read("client/src/components/world/SlotPrizeStrip.tsx");
  const clearing = read("client/src/components/ClearingCurrencyDropLayer.tsx");
  const chests = read("client/src/components/ClearingRewardChests.tsx");

  assert.match(bingo, /src=\{currencyAssets\.coin\}/);
  assert.match(slots, /coin: currencyAssets\.coin/);
  assert.match(wheel, /const coinIcon = currencyAssets\.coin/);
  assert.match(wheel, /slot\.imageUrl \|\| coinIcon/, "admin-selected prize art remains supported");
  assert.match(strip, /imageUrl: currencyAssets\.coin/);
  assert.match(clearing, /drop\.currency==="coins"\?PARA_PETS_COIN_IMAGE/);
  assert.match(chests, /imageUrl:PARA_PETS_COIN_IMAGE/);
  assert.match(chests, /chest\.rewards\.coins>0/);
});

test("Pet Care Hunger artwork has responsive extra clearance below the pet and keeps jars stationary", () => {
  const css = read("client/src/index.css");
  const page = read("client/src/features/pet-care/FeedingOverlay.tsx");
  const selector = ".pet-care-inventory-section .pet-care-hunger {";
  const start = css.indexOf(selector);
  assert.ok(start > -1);
  const hunger = css.slice(start, css.indexOf("}", start) + 1);
  assert.match(hunger, /width: min\(\s*calc\(94% - var\(--pet-care-usable-left\) - var\(--pet-care-scene-right\)\),\s*clamp\(296px, 45vw, 380px\)\s*\)/);
  assert.match(hunger, /clamp\(48px, 6dvh, 72px\)/);
  assert.match(hunger, /transform: translate\(/);
  assert.match(page, /<PetCareHungerMeter[\s\S]*hungerVal=\{hungerVal\}[\s\S]*hungerPct=\{hungerPct\}/);
  assert.match(page, /className="pet-care-inventory-jars"/);
});
