import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");
const portal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

test("Pet World door shop blocking dialogs use the shared viewport modal layer", () => {
  assert.match(source, /import ViewportModalPortal from "@\/components\/ViewportModalPortal"/);
  assert.equal((source.match(/<ViewportModalPortal>/g) ?? []).length, 2);
  assert.equal((source.match(/<\/ViewportModalPortal>/g) ?? []).length, 2);
  assert.match(source, /data-testid="pet-world-door-buy-viewport-modal"/);
  assert.match(source, /data-testid="pet-world-door-picker-viewport-modal"/);

  const buyStart = source.indexOf("Price-tag buy modal for door shop items");
  const pickerStart = source.indexOf("Door Item Picker Modal");
  const pickerEnd = source.indexOf("Panel drag ghost", pickerStart);
  const buySection = source.slice(buyStart, pickerStart);
  const pickerSection = source.slice(pickerStart, pickerEnd);
  assert.doesNotMatch(buySection, /maxWidth: "768px"|className="fixed inset-0/);
  assert.doesNotMatch(pickerSection, /maxWidth: "768px"|className="fixed inset-0/);
});

test("door shop purchase behavior remains unchanged", () => {
  assert.match(source, /data-testid="button-door-price-buy"/);
  assert.match(source, /data-testid="button-door-confirm-buy"/);
  assert.match(source, /const totalCost = item\.price \* \(item\.type === "pet" \? 1 : doorBuyQty\)/);
  assert.match(source, /doorBuyMutation\.mutate\(\{ itemId: item\.id, quantity: doorBuyQty \}\)/);
  assert.match(source, /Math\.min\(maxQty, q \+ 1\)/);
});

test("door shop admin assignment controls remain unchanged", () => {
  assert.match(source, /data-testid="button-close-door-item-picker"/);
  assert.match(source, /button-door-assign-\$\{si\.id\}/);
  assert.match(source, /button-door-unassign-\$\{si\.id\}/);
  assert.match(source, /assignDoorItemMutation\.mutate\(\{ doorId: activeDoorId, itemId: si\.id \}\)/);
  assert.match(source, /unassignDoorItemMutation\.mutate\(\{ doorId: activeDoorId, itemId: si\.id \}\)/);
  assert.match(source, /button-door-assign-bundle-\$\{bundle\.id\}/);
  assert.match(source, /button-door-assign-decor-\$\{decor\.id\}/);
});

test("Pet World interactive door interior stays on its existing camera surface", () => {
  const interiorStart = source.indexOf("Door Interior Overlay");
  const buyStart = source.indexOf("Price-tag buy modal for door shop items");
  const interior = source.slice(interiorStart, buyStart);
  assert.match(interior, /className="fixed inset-0 z-50 overflow-hidden"/);
  assert.match(interior, /maxWidth: "768px"/);
  assert.match(interior, /onPointerDown=\{handleInteriorPointerDown\}/);
  assert.match(interior, /onPointerMove=\{handleDoorDecorPointerMove\}/);
});

test("shared viewport modal keeps native fallback behavior", () => {
  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
  assert.match(portal, /VIEWPORT_HUD_ID/);
});
