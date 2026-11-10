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

test("featured pet controls keep server-backed featured companion and pet-ID routes", () => {
  assert.match(inventory, /data-testid=\{`button-pet-menu-\$\{selectedPet\.inventoryId\}`\}/);
  assert.match(inventory, /data-pet-menu-trigger/);
  assert.match(inventory, /<PetActionMenu inline/);
  assert.match(inventory, /navigate\(petInventoryActionHref\(action, inventoryId\)\)/);
  assert.match(inventory, /data-testid=\{`button-feature-main-pet-\$\{selectedPet\.inventoryId\}`\}/);
  assert.match(inventory, /onToggle\(selectedPet\.inventoryId\)/);
  assert.match(inventory, /apiRequest\("PATCH", "\/api\/user\/active-pet"/);
  assert.match(menu, /function InlinePetActionMenu/);
  assert.match(menu, /PET_MENU_ACTIONS\.map/);
  assert.match(menu, /data-testid=\{`inventory-pet-action-\$\{action\}`\}/);
  assert.match(menu, /onSelect\(action, petInventoryId\)/);
  assert.match(menu, /<FloatingPetActionMenu/);
  assert.match(menuCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(menuCss, /font: 700 clamp\(10px, 2\.8vw, 12px\)/);
});

test("unhatched eggs occupy a separated section with existing hatch-check and speedup flows", () => {
  assert.match(inventory, /data-testid="inventory-pets-eggs-divider"/);
  assert.match(inventory, /Unhatched Eggs · \{petEggs\.length\}/);
  assert.match(inventory, /data-testid="inventory-pet-eggs"/);
  assert.match(inventory, /petEggs\.map\(pet =>/);
  assert.match(inventory, /apiRequest\("POST", `\/api\/pet\/\$\{inventoryId\}\/hatch-check`\)/);
  assert.match(inventory, /hatchCheckMutation\.mutate\(pet\.inventoryId\)/);
  assert.match(inventory, /onEggSpeedUp\?\.\(pet\.inventoryId\)/);
  assert.match(inventory, /<HatchProgressBar hatchStartedAt=\{pet\.hatchStartedAt\} hatchTime=\{pet\.hatchTime\} \/>/);
  assert.match(inventory, /data-pet-inv-id=\{pet\.inventoryId\}/);
  assert.match(showcaseCss, /\.pet-collection__divider::before, \.pet-collection__divider::after/);
});

test("the new forest-gold presentation keeps effects subtle and accessible", () => {
  assert.match(inventory, /Companion Grove/);
  assert.match(inventory, /PetInventoryShowcase\.css/);
  assert.match(showcaseCss, /rgba\(17, 57, 39, \.95\)/);
  assert.match(showcaseCss, /\.pet-spotlight__mote/);
  assert.match(showcaseCss, /@keyframes pet-spotlight-sweep/);
  assert.match(showcaseCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(showcaseCss, /\.pet-collection button:focus-visible/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /preventScroll: true/);
});
