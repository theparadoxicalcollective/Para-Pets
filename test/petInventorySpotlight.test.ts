import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const inventory = read("client/src/components/PetInventory.tsx");
const menu = read("client/src/components/PetActionMenu.tsx");
const menuCss = read("client/src/components/PetActionMenu.css");
const showcaseCss = read("client/src/components/PetInventoryShowcase.css");

test("companion spotlight selects one saved hatched pet and retains active-pet fallback", () => {
  assert.match(inventory, /const \[selectedPetId, setSelectedPetId\] = useState<string \| null>\(null\)/);
  assert.match(inventory, /const hatchedPets = sortedPets\.filter\(pet => pet\.isHatched\)/);
  assert.match(inventory, /const petEggs = sortedPets\.filter\(pet => !pet\.isHatched\)/);
  assert.match(inventory, /hatchedPets\.find\(pet => pet\.inventoryId === selectedPetId\)/);
  assert.match(inventory, /hatchedPets\.find\(pet => pet\.inventoryId === activePetId\)/);
  assert.match(inventory, /data-testid="inventory-featured-pet"/);
  assert.match(inventory, /data-testid="inventory-hatched-pets"/);
  assert.match(inventory, /setSelectedPetId\(pet\.inventoryId\)/);
  assert.match(inventory, /aria-pressed=\{selectedPet\?\.inventoryId === pet\.inventoryId\}/);
  assert.match(inventory, /<HatchedPetArtwork pet=\{selectedPet\} \/>/);
  assert.match(inventory, /<InventoryPetPortrait/);
});

test("selected pet actions stay routed by inventory ID without a featured companion button", () => {
  assert.doesNotMatch(inventory, /data-testid=\{`button-pet-menu-\$\{selectedPet\.inventoryId\}`\}|data-pet-menu-trigger/);
  assert.match(inventory, /<PetActionMenu inline alwaysVisible/);
  assert.match(inventory, /navigate\(petInventoryActionHref\(action, inventoryId\)\)/);
  assert.doesNotMatch(inventory, /button-feature-main-pet-|Set Featured Companion| · Featured/);
  assert.doesNotMatch(inventory, /spotlightRef\.current\?\.scrollIntoView/);
  assert.match(inventory, /className=\{pageMode \? "pet-collection pet-collection--page"/);
  assert.match(inventory, /apiRequest\("PATCH", "\/api\/user\/active-pet"/);
  assert.match(menu, /function InlinePetActionMenu/);
  assert.match(menu, /PET_MENU_ACTIONS\.map/);
  assert.match(menu, /data-testid=\{`inventory-pet-action-\$\{action\}`\}/);
  assert.match(menu, /onSelect\(action, petInventoryId\)/);
  assert.match(menu, /<FloatingPetActionMenu/);
  assert.match(menu, /if \(alwaysVisible\) return/);
  assert.match(menu, /if \(!alwaysVisible\)/);
  assert.match(menuCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(menuCss, /font: 700 clamp\(10px, 2\.8vw, 12px\)/);
});

test("Pets and Eggs tabs switch one independently scrollable grid and retain hatching flows", () => {
  assert.match(inventory, /data-testid="inventory-pets-eggs-divider"/);
  assert.match(inventory, /data-testid="inventory-tab-pets"/);
  assert.match(inventory, /data-testid="inventory-tab-eggs"/);
  assert.match(inventory, /aria-selected=\{activeCollectionTab === "pets"\}/);
  assert.match(inventory, /aria-selected=\{activeCollectionTab === "eggs"\}/);
  assert.match(inventory, /data-testid="inventory-pet-collection-scroll"/);
  assert.match(inventory, /ref=\{collectionScrollRef\}/);
  assert.match(inventory, /collectionScrollRef\.current\.scrollTop = 0/);
  assert.match(showcaseCss, /scrollbar-width: none/);
  assert.match(showcaseCss, /touch-action: pan-y/);
  assert.doesNotMatch(inventory, /Unhatched Eggs ·|Hatched Companions ·/);
  assert.match(inventory, /data-testid="inventory-pet-eggs"/);
  assert.match(inventory, /petEggs\.map\(pet =>/);
  assert.match(inventory, /apiRequest\("POST", `\/api\/pet\/\$\{inventoryId\}\/hatch-check`\)/);
  assert.match(inventory, /hatchCheckMutation\.mutate\(pet\.inventoryId\)/);
  assert.match(inventory, /onEggSpeedUp\?\.\(pet\.inventoryId\)/);
  assert.match(inventory, /<HatchProgressBar hatchStartedAt=\{pet\.hatchStartedAt\} hatchTime=\{pet\.hatchTime\} \/>/);
  assert.match(inventory, /data-pet-inv-id=\{pet\.inventoryId\}/);
  assert.match(showcaseCss, /\.pet-collection__overview-divider/);
  assert.match(showcaseCss, /\.pet-collection__divider::before, \.pet-collection__divider::after/);
});

test("the new forest-gold presentation keeps effects subtle and accessible", () => {
  assert.doesNotMatch(inventory, /Companion Grove|Your Selected Companion/);
  assert.match(inventory, /className=\{pageMode \? "hidden" : "px-4 pb-0"\}/);
  assert.match(showcaseCss, /grid-template-columns: clamp\(90px, 28vw, 132px\) minmax\(0, 1fr\)/);
  assert.match(showcaseCss, /grid-template-columns: repeat\(auto-fill, minmax\(min\(27vw, 90px\), 1fr\)\)/);
  assert.doesNotMatch(showcaseCss, /pet-spotlight__featured|pet-collection__section-head/);
  assert.match(inventory, /PetInventoryShowcase\.css/);
  assert.match(showcaseCss, /rgba\(17, 57, 39, \.95\)/);
  assert.match(showcaseCss, /\.pet-spotlight__mote/);
  assert.match(showcaseCss, /@keyframes pet-spotlight-sweep/);
  assert.match(showcaseCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(showcaseCss, /\.pet-collection button:focus-visible/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /preventScroll: true/);
});
