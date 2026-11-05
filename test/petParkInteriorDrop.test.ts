import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { petParkInteriorDropPoint } from "../client/src/lib/petParkInteriorDrop";

test("panned Pet Park interior drops use artwork coordinates rather than the narrow visible viewport", () => {
  const viewport = { left: 0, top: 70, width: 400, height: 690 };
  const artwork = { left: -400, top: 70, width: 1200, height: 690 };
  const point = petParkInteriorDropPoint({ x: 100, y: 415 }, viewport, artwork);
  assert.ok(point);
  assert.ok(Math.abs(point.xPct - 500 / 1200) < 1e-10);
  assert.equal(point.yPct, 0.5);
  assert.equal(petParkInteriorDropPoint({ x: 10, y: 800 }, viewport, artwork), null);
  assert.equal(petParkInteriorDropPoint({ x: 600, y: 415 }, viewport, artwork), null);
  assert.equal(petParkInteriorDropPoint({ x: 100, y: 415 }, viewport, { ...artwork, width: 0 }), null);
});

test("Pet Park uses template IDs, not shop item IDs, for both personal and public art", () => {
  const routes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const portrait = readFileSync("client/src/components/PetParkPetPortrait.tsx", "utf8");
  const room = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
  const inventory = readFileSync("server/routes/inventoryRead.routes.ts", "utf8");
  assert.equal((routes.match(/petTemplateId: shopItems\.petTemplateId/g) ?? []).length, 2);
  assert.doesNotMatch(routes, /petTemplateId: userInventory\.shopItemId/);
  assert.match(inventory, /petTemplateId: shopItem\?\.petTemplateId/);
  assert.match(page, /petTemplateId=\{p\.petTemplateId\}/);
  assert.match(portrait, /<PetAnimator petTemplateId=\{petTemplateId\}/);
  assert.match(portrait, /<MiniPetRenderer petInventoryId=\{petInventoryId\}/);
  assert.match(room, /data-park-interior-artwork/);
  assert.match(page, /dropEquippedPetInside\(drag\.petId/);
  assert.match(page, /data-testid="pet-park-interior-slots"/);
  assert.match(page, /aria-label=\{fullPageRoom \? "Exit room" : "Exit building"\}/);
});
