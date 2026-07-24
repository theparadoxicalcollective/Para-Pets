import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../client/src/pages/SellFishPage.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

const queueStart = source.indexOf('data-testid="selected-fish-scroll-container"');
const confirmBarStart = source.indexOf('data-testid="confirm-sell-bar"');
const inventoryStart = source.indexOf("{/* Fish inventory */}");

test("selected fish queue is bounded and supports native vertical touch scrolling", () => {
  assert.notEqual(queueStart, -1);
  const queueMarkup = source.slice(queueStart, confirmBarStart);

  assert.match(queueMarkup, /selected-fish-scroll-container/);
  assert.match(styles, /\.selected-fish-scroll-container\s*\{\s*max-height:\s*min\(28vh, 220px\)/);
  assert.match(styles, /@supports \(height: 100dvh\)[\s\S]*max-height:\s*min\(28dvh, 220px\)/);
  assert.match(queueMarkup, /overflow-y-auto/);
  assert.match(queueMarkup, /overscrollBehavior:\s*"contain"/);
  assert.match(queueMarkup, /WebkitOverflowScrolling:\s*"touch"/);
  assert.match(queueMarkup, /touchAction:\s*"pan-y"/);
});

test("queued count stays above the queue and confirm controls remain a non-shrinking sibling", () => {
  const countStart = source.indexOf("fish queued");
  assert.ok(countStart > -1 && countStart < queueStart);
  assert.ok(confirmBarStart > queueStart && confirmBarStart < inventoryStart);

  const confirmMarkup = source.slice(confirmBarStart, inventoryStart);
  assert.match(confirmMarkup, /shrink-0/);
  assert.match(confirmMarkup, /data-testid="button-confirm-sell"/);
  assert.match(confirmMarkup, /env\(safe-area-inset-bottom, 0px\)/);
});

test("Sell All still queues only eligible bag fish and selected fish remain removable", () => {
  assert.match(source, /const bagFish = fishInventory\.filter\(f => !f\.inAquarium\)/);
  assert.match(source, /setCartIds\(new Set\(inventoryFish\.map\(f => f\.id\)\)\)/);
  assert.match(source, /onClick=\{\(\) => removeFromCart\(fish\.id\)\}/);
});

test("desktop mouse dragging and phone inventory scrolling remain enabled", () => {
  assert.match(source, /if \(e\.pointerType !== "mouse"\) return/);
  assert.match(source, /onPointerMove=\{handleDragMove\}/);
  assert.match(source, /style=\{\{ touchAction: "pan-y" \}\}/);
});
