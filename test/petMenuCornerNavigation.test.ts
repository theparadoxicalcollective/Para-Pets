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
  assert.match(nav, /bottom: isHome \\? undefined : 16/);
  assert.match(nav, /top: isHome \\? "min\\(242px/);
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

test("all five Pet Menu controls use their artwork as the only visible frame while retaining tap sizes", () => {
  const petMenu = home.slice(home.indexOf("{/* Screen-relative Pet Menu:"), home.indexOf("{/* Daily quest hints follow"));
  for (const [id, size] of [
    ["button-open-pet-menu", 56],
    ["button-action-power-up", 48],
    ["button-action-level-up", 48],
    ["button-action-equip-accessories", 48],
    ["button-action-care-feed", 48],
  ] as const) {
    const line = petMenu.split("\n").find(part => part.includes(`data-testid="${id}"`));
    assert.ok(line, `Menu control missing: ${id}`);
    assert.ok(line.includes(`h-[${size}px] w-[${size}px]`), `Hit target changed for ${id}`);
    assert.match(line, /rounded-full border-0 bg-transparent p-0/, `Redundant button frame on ${id}`);
    assert.match(line, /focus-visible:outline/, `Keyboard focus should remain visible on ${id}`);
    assert.doesNotMatch(line, /border-2|bg-\[#142819\]|shadow-\[0_0/);
  }
  assert.match(petMenu, /h-full w-full object-contain drop-shadow-\[0_2px_3px_#000\]/);
});

test("pet-action labels remain readable and anchored to their original menu buttons", () => {
  const petMenu = home.slice(home.indexOf("{/* Screen-relative Pet Menu:"), home.indexOf("{/* Daily quest hints follow"));
  const labelLines = petMenu.split("\n").filter(line => line.includes('className="pointer-events-none absolute -bottom-4'));
  assert.equal(labelLines.length, 4);
  for (const label of ["Power-Up", "Level Up", "Closet", "Pet Care"]) {
    const line = labelLines.find(line => line.includes(`>${label}</span>`));
    assert.ok(line, `Missing menu label: ${label}`);
    assert.match(line, /-bottom-4 left-1\/2 -translate-x-1\/2/);
    assert.match(line, /text-\[12px\] font-extrabold/);
    assert.match(line, /text-\[#ffe7ab\]/);
    assert.match(line, /textShadow: "0 2px 2px #000, 0 0 7px #000/);
  }
});
