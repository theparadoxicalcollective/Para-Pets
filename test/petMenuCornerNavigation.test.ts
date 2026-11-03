import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet Menu is anchored to the opposite lower corner with circular upward options with labels", () => {
  assert.match(home, /data-testid="active-pet-side-menu"/);
  assert.match(home, /left: 12, bottom: "calc\(82px \+ env\(safe-area-inset-bottom, 0px\)\)"/);
  assert.match(home, /data-testid="pet-menu-options" className="flex flex-col-reverse items-center gap-4 pb-3"/);
  for (const id of ["power-up", "level-up", "equip-accessories", "care-feed"]) {
    assert.match(home, new RegExp(`data-testid="button-action-${id}"[^\\n]*rounded-full`));
  }
  assert.match(home, /className="absolute flex flex-col-reverse items-center gap-3"/);
  for (const label of ["Power-Up", "Level Up", "Closet", "Pet Care"]) assert.ok(home.includes(`>${label}</span>`));
  assert.match(nav, /bottom: 16/);
  assert.match(nav, /right: 12/);
});

test("main navigation and pet menu close each other when opened", () => {
  assert.match(home, /window\.dispatchEvent\(new Event\("para-pets:pet-menu-open"\)\)/);
  assert.match(home, /window\.addEventListener\("para-pets:main-nav-open", closeForMainNav\)/);
  assert.match(nav, /window\.dispatchEvent\(new Event\("para-pets:main-nav-open"\)\)/);
  assert.match(nav, /window\.addEventListener\("para-pets:pet-menu-open", closeForPetMenu\)/);
});

test("Pet Menu uses uploaded artwork and preserves existing quest button targets", () => {
  for (const image of ["NewPetMenuButton.PNG", "NewPowerUpButton.PNG", "NewLevelUpButton.PNG", "NewClosetBotton.PNG", "NewPetCareButton.PNG"]) {
    assert.ok(home.includes(`@assets/uploads/${image}`), `Missing Pet Menu import: ${image}`);
    const asset = statSync(`attached_assets/uploads/${image}`);
    assert.ok(asset.isFile() && asset.size > 1024, `Pet Menu icon must exist: ${image}`);
  }
  for (const id of ["button-open-pet-menu", "button-action-power-up", "button-action-level-up", "button-action-equip-accessories", "button-action-care-feed"]) {
    assert.ok(home.includes(`data-testid="${id}"`), id);
  }
  const topBar = readFileSync("client/src/components/TopBar.tsx", "utf8");
  assert.match(topBar, /@assets\/uploads\/CoinBundleIcon\.png/);
  assert.doesNotMatch(topBar, /@assets\/uploads\/MainGameCoinImage\.PNG/, "Do not replace the original coin balance bar");
  assert.ok(statSync("attached_assets/uploads/MainGameCoinImage.PNG").size > 1024);
  assert.match(topBar, /<img src=\{coinBarImg\} alt="Coins"/, "Retain the coin counter frame");
  const standaloneCoins = readFileSync("client/src/lib/coinAssets.ts", "utf8");
  assert.match(standaloneCoins, /@assets\/uploads\/MainGameCoinImage\.PNG/, "Use the new coin for standalone reward/shop images");
  assert.match(topBar, /src=\{coinBarImg\}/, "Keep the full original balance frame, including its original emblem");
  assert.match(topBar, /data-testid="text-coins"/, "Keep the current coin balance display");
  assert.match(topBar, /data-testid="button-coin-bag"/);
});
