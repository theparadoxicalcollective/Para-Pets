import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const closet = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const portal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

test("Closet overlays keep native HUD stacking with live controls", () => {
  assert.match(closet, /<ViewportModalPortal enabled=\{deviceSurface\} blocking=\{false\}>\s*<button[\s\S]*?data-testid="button-close-equip-accessories"/);
  assert.match(closet, /<ViewportModalPortal enabled=\{deviceSurface\} blocking=\{false\}>\s*<aside[^>]+data-testid="mini-pet-inventory"/);
  assert.match(closet, /<ViewportModalPortal enabled=\{deviceSurface\} blocking=\{false\}>\s*<aside[^>]+data-testid="accessory-bag-drawer"/);
  assert.match(closet, /data-testid="mini-pet-inventory"[\s\S]{0,260}pointerEvents: "auto"/);
  assert.match(closet, /data-testid="accessory-bag-drawer"[\s\S]{0,260}pointerEvents: "auto"/);
  assert.match(portal, /viewportPointerEvents\(blocking \? "blocking" : "decorative"\)/);
});

test("Closet controls still open and close their existing panels", () => {
  assert.match(closet, /data-testid="button-open-mini-pets"[\s\S]{0,120}onClick=\{\(\) => setMiniPetOpen\(true\)\}/);
  assert.match(closet, /aria-label="Close Mini Pets inventory" onClick=\{\(\) => setMiniPetOpen\(false\)\}/);
  assert.match(closet, /aria-label="Close accessory bag" onClick=\{\(\) => setBagOpen\(false\)\}/);
  assert.match(closet, /data-testid="button-close-equip-accessories"[\s\S]{0,160}onClick=\{onClose\}/);
});
