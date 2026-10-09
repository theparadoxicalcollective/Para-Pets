import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const bagPage = readFileSync("client/src/pages/BagInventoryPage.tsx", "utf8");
const petPage = readFileSync("client/src/pages/PetInventoryPage.tsx", "utf8");

test("Bag and Pet Inventory dedicated routes share the same page-mode component", () => {
  assert.match(bagPage, /<PetInventory[\s\S]*defaultTab="bag"[\s\S]*pageMode/);
  assert.match(petPage, /<PetInventory[\s\S]*defaultTab="pets"[\s\S]*pageMode/);
});

test("page-mode inventory owns the canonical stage and its expanded backdrop", () => {
  assert.match(inventory, /data-stage-coordinate-space=\{pageMode \? "canonical" : undefined\}/);
  assert.match(inventory, /data-viewport-visual-owner=\{pageMode \? "backdrop" : undefined\}/);
  assert.match(inventory, /data-canonical-visual-layer=\{pageMode \? "duplicate-backdrop" : undefined\}/);
  assert.match(inventory, /style=\{pageMode \? undefined : \{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 \}\}/);
  assert.match(inventory, /pageMode && \([\s\S]*?<ViewportBackdropPortal>/);
  assert.match(inventory, /data-testid="inventory-viewport-backdrop"/);
  assert.match(inventory, /src=\{petInvForestBg\}/);
  assert.doesNotMatch(inventory, /className=\{pageMode \? "absolute inset-0 flex flex-col" : "fixed inset-0 z-40 flex flex-col"\} style=\{\{ maxWidth: "768px"/);
});

test("dedicated inventory dialogs use the shared viewport modal layer without changing overlay mode", () => {
  assert.equal((inventory.match(/<ViewportModalPortal enabled=\{!!pageMode\}>/g) ?? []).length, 4);
  assert.equal((inventory.match(/<\/ViewportModalPortal>/g) ?? []).length, 4);

  assert.match(inventory, /className=\{pageMode \? "absolute inset-0 z-\[80\] flex items-end justify-center" : "fixed inset-0 z-\[80\] flex items-end justify-center"\}/);
  assert.match(inventory, /className=\{pageMode \? "absolute inset-0 z-\[100\] flex items-center justify-center" : "fixed inset-0 z-\[100\] flex items-center justify-center"\}/);
  assert.match(inventory, /maxWidth: pageMode \? 430 : undefined/);
});

test("inventory drag ghost uses stage coordinates only on dedicated pages", () => {
  assert.match(inventory, /import \{ clientPointInRenderedElement, clientToStage \} from "@\/lib\/stage"/);
  assert.match(inventory, /return pageMode \? clientToStage\(clientX, clientY\) : \{ x: clientX, y: clientY \}/);
  assert.match(inventory, /clientPointInRenderedElement\(/);
  assert.ok((inventory.match(/toDragPoint\(ev\.clientX, ev\.clientY\)/g) ?? []).length >= 4);
  assert.match(inventory, /className=\{pageMode \? "absolute z-\[90\] pointer-events-none select-none" : "fixed z-\[90\] pointer-events-none select-none"\}/);

  // Actual hit testing remains in browser client coordinates.
  assert.match(inventory, /getBoundingClientRect\(\)/);
  assert.match(inventory, /ev\.clientX >= dropRect\.left/);
  assert.match(inventory, /document\.elementFromPoint\(ev\.clientX, ev\.clientY\)/);
});

test("inventory ownership and item/pet actions remain unchanged", () => {
  assert.match(inventory, /apiRequest\("PATCH", "\/api\/user\/active-pet", \{ activePetId: petId \}\)/);
  assert.ok((inventory.match(/apiRequest\("POST", `\/api\/pet\/\$\{petInvId\}\/use-special`, \{ itemInventoryId: itemInvId \}\)/g) ?? []).length >= 2);
  assert.match(inventory, /item\.type === "pet" && !item\.isListed/);
  assert.match(inventory, /!item\.isListed[\s\S]*item\.type !== "pet"/);
  assert.match(inventory, /equippedAccessoryIdSet\.has\(item\.inventoryId\)/);
});
