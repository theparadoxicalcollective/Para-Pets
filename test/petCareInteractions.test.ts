import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyPetCareItemGesture,
  PET_CARE_VISIBLE_SLOTS,
  pointInsideExpandedPetDropZone,
} from "../client/src/lib/petCareInteractions";

test("pet-care gesture intent waits for the movement threshold", () => {
  assert.equal(classifyPetCareItemGesture(5, -5), "pending");
});

test("horizontal travel selects native shelf scrolling", () => {
  assert.equal(classifyPetCareItemGesture(28, -8), "horizontal-scroll");
});

test("only primarily upward travel selects item dragging", () => {
  assert.equal(classifyPetCareItemGesture(8, -25), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(3, 25), "horizontal-scroll");
  assert.equal(classifyPetCareItemGesture(20, -21), "horizontal-scroll");
});

test("expanded pet drop zone accepts padded edges and rejects outside points", () => {
  const rect = { left: 100, right: 200, top: 100, bottom: 200 };
  assert.equal(pointInsideExpandedPetDropZone({ x: 91, y: 150 }, rect, 10), true);
  assert.equal(pointInsideExpandedPetDropZone({ x: 89, y: 150 }, rect, 10), false);
});

test("both inventories share the reusable six-slot shelf without old panels", () => {
  assert.equal(PET_CARE_VISIBLE_SLOTS, 6);
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");
  assert.match(page, /<PetCareItemShelf kind="edibles"/);
  assert.match(page, /<PetCareItemShelf kind="gifts"/);
  assert.match(page, /"--pet-care-visible-slots": PET_CARE_VISIBLE_SLOTS/);
  assert.match(css, /\/ var\(--pet-care-visible-slots\)\)/);
  assert.match(css, /\.pet-care-item-shelf__heading[\s\S]*justify-content: center/);
  assert.doesNotMatch(page, /pet-care-item-shelf__name/);
  assert.doesNotMatch(page, /border: "1\.5px solid rgba\(120,210,90,0\.38\)"/);
  assert.doesNotMatch(page, /border: "1\.5px solid rgba\(240,140,200,0\.38\)"/);
});

test("care items capture the pointer before intent detection", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const pointerDown = page.slice(
    page.indexOf("const onItemPointerDown"),
    page.indexOf("const onItemPointerMove"),
  );
  assert.match(pointerDown, /setPointerCapture\(e\.pointerId\)/);
  assert.match(page, /playGrab\(\)/);
  assert.match(page, /playPlop\(\)/);
});

test("pointer cancellation is cleanup-only and server mutation paths stay intact", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const cancelHandler = page.slice(
    page.indexOf("const onItemPointerCancel"),
    page.indexOf("return (", page.indexOf("const onItemPointerCancel")),
  );
  assert.match(cancelHandler, /cleanupItemGesture\(\)/);
  assert.doesNotMatch(cancelHandler, /\.mutate\(/);
  assert.match(page, /`\/api\/pet\/\$\{pet\.inventoryId\}\/feed-edible`/);
  assert.match(page, /`\/api\/pet\/\$\{pet\.inventoryId\}\/give-gift`/);
});
