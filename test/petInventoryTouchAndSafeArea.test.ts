import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
test("inventory restores hit testing under noninteractive viewport host", () => {
  assert.match(app, /id="game-viewport-page"/);
  assert.ok(inventory.includes('style={pageMode ? { pointerEvents: "auto", touchAction: "pan-y" }'));
  assert.ok(inventory.includes('data-testid="button-close-inventory"'));
  assert.ok(inventory.includes("button-select-pet-"));
});
test("inventory respects phone safe areas", () => {
  assert.ok(inventory.includes("env(safe-area-inset-top, 0px) + 44px"));
  assert.ok(inventory.includes("env(safe-area-inset-bottom, 0px) + 24px"));
});
