import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

test("Decor and Objects inventory uses a compact scrollable mobile drawer", () => {
  assert.match(source, /openInventory === "decor" \? "px-4 pt-3 pb-20"/);
  assert.match(source, /openInventory === "decor" \? 210 : 260/);
  assert.match(source, /openInventory === "decor" \? "calc\(58\*var\(--vh\)\)"/);
  assert.match(source, /overflowY: openInventory === "pets" \? "hidden" : "auto"/);
  assert.match(source, /openInventory === "decor" \? "w-8 h-8 object-contain"/);
  assert.match(source, /className="grid grid-cols-4 gap-2"/);
  assert.match(source, /className="w-full rounded-xl overflow-hidden relative"/);
  assert.match(source, /aria-label="Close inventory"/);
});

test("Home inventory and blocking confirmations share the device HUD with modal ownership above controls", () => {
  assert.match(source, /Inventory overlay panel lives in the device HUD/);
  assert.match(source, /\{openInventory && \([\s\S]*?<ViewportHudPortal>[\s\S]*?zIndex: openInterior \? 70 : 250/);
  assert.match(source, /Bundle activation modal/);
  assert.match(source, /<ViewportModalPortal>/);
  assert.match(source, /data-testid="bundle-activation-modal"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});

test("compact inventory keeps Decor and Object drag behavior intact", () => {
  assert.match(source, /onPointerDown=\{\(e\) => handleInvDragStart\(e, entry\.decorItemId, entry\.item\.imageUrl, entry\.item\.type\)\}/);
  assert.match(source, /onPointerMove=\{\(e\) => \{/);
  assert.match(source, /setInventoryDragState\(/);
  assert.match(source, /setIsDraggingDecor\(true\)/);
  assert.match(source, /section\.type === "object"/);
});
