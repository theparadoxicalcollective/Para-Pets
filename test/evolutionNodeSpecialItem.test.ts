import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EVOLUTION_SLOT_COUNT,
  completelyFillCurrentEvolutionNode,
} from "../shared/evolution";
import { getGameItemCategory } from "../shared/itemTaxonomy";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Completely fill a node advances exactly one current evolution node", () => {
  const partial = completelyFillCurrentEvolutionNode(2, 4);
  assert.deepEqual(
    {
      completedSlots: partial.completedSlots,
      currentPoints: partial.currentPoints,
      completedNow: partial.completedNow,
      isComplete: partial.isComplete,
    },
    { completedSlots: 3, currentPoints: 0, completedNow: 1, isComplete: false },
  );

  const final = completelyFillCurrentEvolutionNode(EVOLUTION_SLOT_COUNT - 1, 1);
  assert.equal(final.completedSlots, EVOLUTION_SLOT_COUNT);
  assert.equal(final.currentPoints, 0);
  assert.equal(final.completedNow, 1);
  assert.equal(final.isComplete, true);
});

test("Admin Special items expose Completely fill a node without an amount field", () => {
  const admin = read("client/src/components/ItemDatabaseSection.tsx");

  assert.match(admin, /<option value="fill_evolution_node">Completely fill a node<\/option>/);
  assert.match(admin, /specialType === "fill_evolution_node"\s*\? null/);
  assert.match(admin, /special-fill-node-note/);
  assert.match(admin, /Completes exactly the evolution node currently being filled/);
});

test("node-fill specials stay in Special Bag filtering and also appear in the Power Up tray", () => {
  assert.equal(getGameItemCategory({ type: "special" }), "specials");

  const home = read("client/src/pages/HomePage.tsx");
  const bag = read("client/src/components/PetInventory.tsx");
  const powerUp = read("client/src/components/PetPowerUpPage.tsx");

  assert.match(home, /inventoryItem\.type === "special" && inventoryItem\.specialType === "fill_evolution_node"/);
  assert.match(home, /items=\{powerUpItems\}/);
  assert.match(bag, /item\.specialType === "fill_evolution_node"/);
  assert.match(bag, /where: "Power Up page"/);
  assert.match(powerUp, /item\.specialType === "fill_evolution_node"\) return "FILL NODE"/);
});

test("server fills the locked current node and consumes the special atomically", () => {
  const route = read("server/routes/petProgressionItem.routes.ts");

  assert.match(route, /specialType === "fill_evolution_node"/);
  assert.match(route, /await ensureEvolutionStorage\(\)/);
  assert.match(route, /SELECT completed_slots, current_points[\s\S]*FOR UPDATE/);
  assert.match(route, /completelyFillCurrentEvolutionNode\(completedSlots, petShopItem\.rarity\)/);
  assert.match(route, /SET completed_slots = \$\{next\.completedSlots\},[\s\S]*current_points = 0/);
  assert.match(route, /tryConsumeOneFromInventory\(tx, user\.id, itemInv\.id\)/);
  assert.match(route, /This pet's evolution track is already complete/);
});

test("Power Up evolution orbit refreshes immediately after the special is used", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const evolution = read("client/src/components/powerup/PowerUpEvolutionPanel.tsx");

  assert.match(home, /window\.dispatchEvent\(new CustomEvent\("pet_evolution_refresh"\)\)/);
  assert.match(evolution, /window\.addEventListener\("pet_evolution_refresh", handler\)/);
  assert.match(evolution, /void refresh\(\)/);
});
