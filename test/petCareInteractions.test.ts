import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyPetCareItemGesture,
  getPetCareDragGhostTransform,
  PET_CARE_DRAG_GHOST_FINGER_GAP_PX,
  PET_CARE_DRAG_GHOST_SIZE_PX,
  PET_CARE_GESTURE_THRESHOLD_PX,
  PET_CARE_VISIBLE_SLOTS,
  pointInsideExpandedPetDropZone,
} from "../client/src/lib/petCareInteractions";

test("pet-care gesture intent waits for the movement threshold", () => {
  assert.equal(PET_CARE_GESTURE_THRESHOLD_PX, 8);
  assert.equal(classifyPetCareItemGesture(4, -4), "pending");
});

test("horizontal travel selects native shelf scrolling", () => {
  assert.equal(classifyPetCareItemGesture(28, -8), "horizontal-scroll");
});

test("only primarily upward travel selects item dragging", () => {
  assert.equal(classifyPetCareItemGesture(3, -8), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(3, 8), "horizontal-scroll");
  assert.equal(classifyPetCareItemGesture(8, -8), "horizontal-scroll");
  assert.equal(classifyPetCareItemGesture(10, -11), "horizontal-scroll");
});

test("drag ghost positioning shares its size and finger-gap constants", () => {
  assert.equal(PET_CARE_DRAG_GHOST_SIZE_PX, 56);
  assert.equal(PET_CARE_DRAG_GHOST_FINGER_GAP_PX, 12);
  assert.equal(getPetCareDragGhostTransform(100, 200), "translate3d(72px, 132px, 0)");
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.equal(page.match(/getPetCareDragGhostTransform\(/g)?.length, 2);
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
  assert.match(page, /pet-care-item-shelf--\$\{kind\}/);
  const viewportRule = css.match(/\.pet-care-item-shelf__viewport\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(viewportRule, /right:\s*var\(--pet-care-shelf-frame-inset\)/);
  assert.match(viewportRule, /left:\s*var\(--pet-care-shelf-frame-inset\)/);
  assert.match(viewportRule, /padding-inline:\s*0/);
  const itemRule = css.match(/\.pet-care-item-shelf__item\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(itemRule, /flex:\s*0 0 calc\(100% \/ var\(--pet-care-visible-slots\)\);/);
  assert.doesNotMatch(itemRule, /pet-care-shelf-frame-inset/);
  const titleRule = css.match(/\.pet-care-item-shelf__title\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(titleRule, /position:\s*absolute/);
  assert.match(titleRule, /left:\s*50%/);
  assert.match(titleRule, /bottom:\s*4%/);
  assert.match(titleRule, /translateX\(-50%\)/);
  assert.doesNotMatch(page, /pet-care-item-shelf__heading/);
  assert.match(page, /pet-care-item-shelf__art-crop pet-care-item-shelf__art-crop--front/);
  assert.doesNotMatch(page, /pet-care-item-shelf__name/);
  assert.doesNotMatch(page, /border: "1\.5px solid rgba\(120,210,90,0\.38\)"/);
  assert.doesNotMatch(page, /border: "1\.5px solid rgba\(240,140,200,0\.38\)"/);
  const edibleShelfRule = css.match(/\.pet-care-item-shelf--edibles\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(edibleShelfRule, /transform:\s*translateY\(clamp\(-8px, -1\.2vh, -4px\)\)/);
});

test("care items capture only after vertical intent and release during cleanup", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const pointerDown = page.slice(
    page.indexOf("const onItemPointerDown"),
    page.indexOf("const onItemPointerMove"),
  );
  assert.doesNotMatch(pointerDown, /setPointerCapture/);
  const pointerMove = page.slice(page.indexOf("const onItemPointerMove"), page.indexOf("const onItemPointerUp"));
  assert.match(pointerMove, /setPointerCapture/);
  const cleanup = page.slice(page.indexOf("const cleanupItemGesture"), page.indexOf("const onItemPointerDown"));
  assert.match(cleanup, /releasePointerCapture/);
  assert.match(page, /playGrab\(\)/);
  assert.match(page, /playPlop\(\)/);
});

test("safe visual mode keeps idle rendering and petting without heavy particle timers", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(page, /onPointerDown=\{dragEnabled \?/);
  assert.match(page, /onPointerMove=\{dragEnabled \? onItemPointerMove/);
  assert.match(page, /\{dragEnabled && dragGhost && \(/);
  assert.match(page, /onClick=\{\(\) => onItemClick\(item\)\}/);
  assert.match(page, /onPointerDown=\{onPetPointerDown\}/);
  assert.match(page, /onPointerMove=\{onPetPointerMove\}/);
  assert.match(page, /mode="idle"/);
  assert.match(page, /performanceStatic=\{safeMode\}/);
  assert.match(page, /if \(!safeMode\) \{[\s\S]*?g\.heartTimer/);
  assert.doesNotMatch(page, /pet-care-safe-static-pet/);
  assert.doesNotMatch(page, /<VisibleAssetImage[^>]*dragGhost/);
});

test("drop applies once only inside the pet and cancellation only resets state", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const up = page.slice(page.indexOf("const onItemPointerUp"), page.indexOf("const onItemPointerCancel"));
  assert.match(up, /if \(!validDrop\) \{\s*cleanupItemGesture\(\);\s*return;/);
  assert.equal(up.match(/void applyCareItem\(d\)/g)?.length, 1);
  const cancel = page.slice(page.indexOf("const onItemPointerCancel"), page.indexOf("const submitFeedSelection"));
  assert.match(cancel, /cleanupItemGesture\(\)/);
  assert.doesNotMatch(cancel, /applyCareItem|mutate/);
});

test("dragging uses direct pointer coordinates", () => {
  const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const moveHandler = page.slice(
    page.indexOf("const onItemPointerMove"),
    page.indexOf("const onItemPointerUp"),
  );
  assert.doesNotMatch(moveHandler, /getCoalescedEvents/);
  assert.match(moveHandler, /updateDragGhostPosition\(point\.clientX, point\.clientY\)/);
  assert.match(moveHandler, /pointInsideExpandedPetDropZone\(\{ x: point\.clientX, y: point\.clientY \}/);
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
