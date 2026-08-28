import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyPetCareItemGesture,
  getPetCareDragGhostTransform,
  PET_CARE_DRAG_GHOST_FINGER_GAP_PX,
  PET_CARE_DRAG_GHOST_SIZE_PX,
  PET_CARE_GESTURE_THRESHOLD_PX,
  pointInsideExpandedPetDropZone,
} from "../client/src/lib/petCareInteractions";
import { getPetCareFeedbackProfile } from "../client/src/lib/petCareSafeMode";

test("pet-care gesture intent waits for the movement threshold", () => {
  assert.equal(PET_CARE_GESTURE_THRESHOLD_PX, 10);
  assert.equal(classifyPetCareItemGesture(4, -4), "pending");
});

test("horizontal travel starts an item drag", () => {
  assert.equal(classifyPetCareItemGesture(28, -8), "vertical-item-drag");
});

test("upward diagonal travel selects item dragging", () => {
  assert.equal(classifyPetCareItemGesture(0, -12), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(8, -12), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(12, -10), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(3, 12), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(8, -8), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(10, -11), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(14, -10), "vertical-item-drag");
});

test("ambiguous initial movement remains pending for later upward intent", () => {
  assert.equal(classifyPetCareItemGesture(9, -2), "pending");
  assert.equal(classifyPetCareItemGesture(10, -18), "vertical-item-drag");
  assert.equal(classifyPetCareItemGesture(2, 12), "vertical-item-drag");
});

test("drag ghost positioning shares its size and finger-gap constants", () => {
  assert.equal(PET_CARE_DRAG_GHOST_SIZE_PX, 56);
  assert.equal(PET_CARE_DRAG_GHOST_FINGER_GAP_PX, 12);
  assert.equal(getPetCareDragGhostTransform(100, 200), "translate3d(72px, 132px, 0)");
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.equal(page.match(/getPetCareDragGhostTransform\(/g)?.length, 2);
});

test("expanded pet drop zone accepts padded edges and rejects outside points", () => {
  const rect = { left: 100, right: 200, top: 100, bottom: 200 };
  assert.equal(pointInsideExpandedPetDropZone({ x: 91, y: 150 }, rect, 10), true);
  assert.equal(pointInsideExpandedPetDropZone({ x: 89, y: 150 }, rect, 10), false);
});

test("both inventories render the repository jar asset with gifts first and unit visuals", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /import petCareJar from "@assets\/uploads\/Jar\.png"/);
  assert.match(page, /const PET_CARE_JAR_VISUAL_CAPACITY = 48;/);
  assert.match(page, /const PET_CARE_JAR_COLUMNS = 6;/);
  assert.match(page, /item: \{ \.\.\.entry\.item, quantity: 1, displayQuantity: 1 \}/);
  assert.match(page, /data-pet-care-inventory-jar="true"/);
  assert.match(page, /data-testid=\{`pet-care-\$\{kind\}-jar`\}/);
  assert.match(page, /src=\{petCareJar\}/);
  assert.match(page, /opacity: 0\.7/);
  assert.match(page, /width: "min\(100%, clamp\(150px, 23dvh, 214px\)\)"/);
  const giftJar = page.indexOf('<PetCareItemShelf kind="gifts"');
  const edibleJar = page.indexOf('<PetCareItemShelf kind="edibles"');
  assert.ok(giftJar >= 0, "gift jar must render");
  assert.ok(edibleJar > giftJar, "gift jar must render before edible jar");
  assert.doesNotMatch(page, /pet-care-item-shelf__quantity/);
  assert.doesNotMatch(page, /"--pet-care-visible-slots"/);
});

test("jar releases compact into gravity-like columns from the floor upward", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /const droppedInsideJar =/);
  assert.match(page, /if \(!active\.hasMoved \|\| !droppedInsideJar/);
  assert.match(page, /columns\[petCareJarColumnForLeft\(position\.left\)\]\.push\(visual\)/);
  assert.match(page, /columns\[targetColumn\]\.push\(releasedVisual\)/);
  assert.match(page, /PET_CARE_JAR_FLOOR - stackIndex \* PET_CARE_JAR_ROW_GAP/);
  assert.match(page, /top \$\{PET_CARE_JAR_SETTLE_MS\}ms cubic-bezier/);
  assert.match(page, /playPlop\(\)/);
});

test("care items capture on pointerdown and release during cleanup", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const pointerDown = page.slice(
    page.indexOf("const onItemPointerDown"),
    page.indexOf("const onItemPointerMove"),
  );
  assert.match(pointerDown, /setPointerCapture/);
  const pointerMove = page.slice(page.indexOf("const onItemPointerMove"), page.indexOf("const onItemPointerUp"));
  assert.doesNotMatch(pointerMove, /setPointerCapture/);
  const cleanup = page.slice(page.indexOf("const cleanupItemGesture"), page.indexOf("const onItemPointerDown"));
  assert.match(cleanup, /releasePointerCapture/);
  assert.match(page, /playGrab\(\)/);
  assert.match(page, /playPlop\(\)/);
  assert.match(page, /className="pet-care-item-jar__item"/);
  assert.match(page, /data-pet-care-stack-id=\{visual\.item\.stackId\}/);
  assert.match(page, /touchAction: "none"/);
});

test("safe visual mode keeps idle rendering and petting without heavy particle timers", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /onPointerDown=\{dragEnabled \?/);
  assert.match(page, /onPointerMove=\{dragEnabled \? onItemPointerMove/);
  assert.match(page, /\{dragEnabled && dragGhost && createPortal\(/);
  assert.match(page, /onClick=\{!dragEnabled \? \(\) => onItemClick\(visual\.item\) : undefined\}/);
  assert.match(page, /onPointerDown=\{onPetPointerDown\}/);
  assert.match(page, /onPointerMove=\{onPetPointerMove\}/);
  assert.match(page, /mode="idle"/);
  assert.match(page, /performanceStatic=\{safeMode\}/);
  const circleEffects = page.slice(page.indexOf("const triggerCircleEffects"), page.indexOf("const onPetPointerMove"));
  assert.match(circleEffects, /g\.heartTimer = window\.setInterval\(tick, feedbackProfile\.pettingIntervalMs\)/);
  assert.match(circleEffects, /burstHearts\(cur\.cx, cur\.cy \+ 30, feedbackProfile\.pettingHeartCount\)/);
  assert.doesNotMatch(circleEffects.slice(0, circleEffects.indexOf("if (!safeMode)")), /burstSparkles/);
  assert.doesNotMatch(page, /pet-care-safe-static-pet/);
  assert.doesNotMatch(page, /<VisibleAssetImage[^>]*dragGhost/);
});

test("reduced visual mode retains lightweight hearts and gold success sparkles", () => {
  const reduced = getPetCareFeedbackProfile(true);
  const normal = getPetCareFeedbackProfile(false);
  assert.ok(reduced.pettingHeartCount >= 3 && reduced.pettingHeartCount <= 5);
  assert.ok(reduced.pettingHeartCount < normal.pettingHeartCount);
  assert.ok(reduced.pettingIntervalMs > normal.pettingIntervalMs);
  assert.ok(reduced.edibleSparkleCount > 0);
  assert.ok(reduced.giftSparkleCount > reduced.edibleSparkleCount);

  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(page, /\{hearts\.map\(\(h\) => \(/);
  assert.match(page, /\{sparkles\.map\(\(s\) => \(/);
  assert.doesNotMatch(page, /!safeMode && hearts\.map/);
  assert.doesNotMatch(page, /!safeMode && sparkles\.map/);
  assert.match(page, /stopColor="#fffbe0"/);
  assert.match(page, /stopColor="#ffd966"/);
  assert.match(page, /stopColor="#c98a00"/);
});

test("food and gift celebrations run only in successful mutation callbacks", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const gift = page.slice(page.indexOf("const giftMutation"), page.indexOf("const claimLoyaltyMutation"));
  const feed = page.slice(page.indexOf("const feedMutation"), page.indexOf("const updateDragGhostPosition"));
  for (const [block, sparkleCount, heartCount] of [
    [gift, "giftSparkleCount", "giftHeartCount"],
    [feed, "edibleSparkleCount", "edibleHeartCount"],
  ] as const) {
    const success = block.slice(block.indexOf("onSuccess:"), block.indexOf("onError:"));
    const error = block.slice(block.indexOf("onError:"));
    assert.match(success, new RegExp(`burstSparkles\\(bx, by, feedbackProfile\\.${sparkleCount}\\)`));
    assert.match(success, new RegExp(`burstHearts\\(bx, by \\+ 30, feedbackProfile\\.${heartCount}\\)`));
    assert.match(success, /setPetBounce\(true\)/);
    assert.doesNotMatch(error, /burstSparkles|burstHearts|setPetBounce\(true\)/);
  }

  const invalidDrop = page.slice(page.indexOf("if (!validDrop)"), page.indexOf("void usePetCareItem(d)"));
  assert.doesNotMatch(invalidDrop, /burstSparkles|burstHearts|success-visual-started/);
});

test("drop applies once only inside the pet and cancellation only resets state", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const up = page.slice(page.indexOf("const onItemPointerUp"), page.indexOf("const onItemPointerCancel"));
  assert.match(up, /if \(!validDrop\) \{\s*cleanupItemGesture\(\);\s*return;/);
  assert.equal(up.match(/void usePetCareItem\(d\)/g)?.length, 1);
  const cancel = page.slice(page.indexOf("const onItemPointerCancel"), page.indexOf("const submitFeedSelection"));
  assert.match(cancel, /cleanupItemGesture\(\)/);
  assert.doesNotMatch(cancel, /usePetCareItem|mutate/);
});

test("dragging uses direct pointer coordinates", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const moveHandler = page.slice(
    page.indexOf("const onItemPointerMove"),
    page.indexOf("const onItemPointerUp"),
  );
  assert.doesNotMatch(moveHandler, /getCoalescedEvents/);
  assert.match(moveHandler, /updateDragGhostPosition\(point\.clientX, point\.clientY\)/);
  assert.match(moveHandler, /pointInsideExpandedPetDropZone\(\{ x: point\.clientX, y: point\.clientY \}/);
});

test("pointer cancellation is cleanup-only and server mutation paths stay intact", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const cancelHandler = page.slice(
    page.indexOf("const onItemPointerCancel"),
    page.indexOf("return (", page.indexOf("const onItemPointerCancel")),
  );
  assert.match(cancelHandler, /cleanupItemGesture\(\)/);
  assert.doesNotMatch(cancelHandler, /\.mutate\(/);
  assert.match(page, /`\/api\/pet\/\$\{pet\.inventoryId\}\/feed-edible`/);
  assert.match(page, /`\/api\/pet\/\$\{pet\.inventoryId\}\/give-gift`/);
});
