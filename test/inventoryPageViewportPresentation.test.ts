import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const bagPage = readFileSync("client/src/pages/BagInventoryPage.tsx", "utf8");
const petPage = readFileSync("client/src/pages/PetInventoryPage.tsx", "utf8");
const shell = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Bag and Pet standalone routes use pageMode inventory ownership", () => {
  assert.match(bagPage, /defaultTab="bag"[\s\S]*pageMode/);
  assert.match(petPage, /defaultTab="pets"[\s\S]*pageMode/);
});

test("inventory page keeps authored content canonical and full-device scenery separate", () => {
  assert.match(inventory, /data-stage-coordinate-space=\{pageMode \? "canonical" : undefined\}/);
  assert.match(inventory, /<ViewportBackdropPortal>[\s\S]*data-testid="inventory-viewport-backdrop"/);
  assert.match(inventory, /data-testid=\{pageMode \? "inventory-canonical-content" : undefined\}/);
  assert.match(inventory, /<BagView items=\{bagItems\} pets=\{pets\}[\s\S]*userId=\{user\.id\} pageMode=\{!!pageMode\}/);
});

test("larger-device inventory moves only its page-level back row to the physical width", () => {
  assert.match(inventory, /data-testid="inventory-page-back-row"/);
  assert.match(shell, /#game-stage\[data-coordinate-owner="stage"\] \[data-testid="inventory-page-back-row"\][\s\S]*--viewport-surface-left[\s\S]*--viewport-surface-right/);
});

test("inventory interactions and modal ownership remain unchanged", () => {
  assert.match(inventory, /onToggle=\{handlePetToggle\}/);
  assert.match(inventory, /onEggSpeedUp=\{\(id\) => setSpeedUpTargetId\(id\)\}/);
  assert.match(inventory, /<ViewportModalPortal enabled=\{!!pageMode\}>/);
  assert.match(inventory, /data-testid="button-close-inventory"/);
});

test("Bag Pets displays compact, view-only tiles with a pet detail modal", () => {
  assert.ok(inventory.includes('<BagView items={bagItems} pets={pets}'));
  assert.ok(inventory.includes('data-testid="bag-full-pets"'));
  assert.ok(inventory.includes('data-testid={`button-bag-pet-${pet.inventoryId}`}'));
  assert.ok(inventory.includes('onClick={() => setSelectedBagPet(pet)}'));
  assert.ok(inventory.includes('data-testid="modal-bag-pet-detail"'));
  assert.ok(inventory.includes('data-testid="button-close-bag-pet-detail"'));
  assert.ok(inventory.includes('<ViewportModalPortal enabled={!!pageMode}>'));
  assert.ok(!inventory.includes('<PetView pets={pets} activePetId={activePetId} onToggle={onPetToggle} onEggSpeedUp={onEggSpeedUp} isPending={petTogglePending} pendingPetId={pendingPetId} readOnly />'));
  assert.ok(inventory.includes('category === "pets" ? pets.length : 0'));
});
