import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = () => readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const css = () => readFileSync("client/src/petCarePolish.css", "utf8");

test("React is the only Pet Care drag owner and portals one ghost", () => {
  const source = page();
  assert.equal(existsSync("client/src/petCarePolish.ts"), false);
  assert.equal(existsSync("client/src/petCarePolishBootstrap.ts"), false);
  assert.match(source, /createPortal\([\s\S]*?pet-care-drag-ghost[\s\S]*?document\.body/);
  assert.equal(source.match(/className="pet-care-drag-ghost"/g)?.length, 1);
  assert.match(source, /onLostPointerCapture=\{dragEnabled \? onItemPointerCancel/);
  assert.match(source, /cancelAnimationFrame\(dragFrameRef\.current\)/);
});

test("exact stack source hides without removing its shelf slot", () => {
  const source = page();
  const styles = css();
  assert.match(source, /data-pet-care-drag-source=\{draggingStackId === item\.stackId/);
  assert.match(source, /key=\{item\.stackId\}/);
  assert.match(source, /draggingStackId=\{dragGhost\?\.stackId \?\? null\}/);
  assert.match(styles, /data-pet-care-drag-source="true"[\s\S]*?pet-care-item-shelf__visible-artwork[\s\S]*?visibility: hidden/);
});

test("stack quantity is React-owned presentation while a drag remains one item", () => {
  const source = page();
  assert.match(source, /item\.displayQuantity > 1 && <span className="pet-care-item-shelf__quantity">×\{item\.displayQuantity\}/);
  assert.doesNotMatch(source, /MutationObserver|getQueryCache\(\)\.subscribe|data-pet-care-stack-quantity/);
  assert.match(source, /feedMutation\.mutateAsync\(\{ itemInventoryId: drag\.inventoryId \}\)/);
});

test("normal mode is drag-only and explicit fallback retains taps", () => {
  const source = page();
  assert.match(source, /onClick=\{!dragEnabled \? \(\) => onItemClick\(item\) : undefined\}/);
  assert.match(source, /onClick=\{!dragEnabled \? applySelectedCareItem : undefined\}/);
  assert.match(source, /data-pet-care-emergency-input-fallback/);
});

test("pet rubbing enters the existing single guarded reward path", () => {
  const source = page();
  assert.match(source, /g\.pathDistance >= 46/);
  assert.match(source, /!g\.rewardTriedThisPress/);
  assert.doesNotMatch(source, /new PointerEvent\(/);
});

test("collectible coin uses a circular halo and no 3D or heavy image filter", () => {
  const source = page();
  const styles = readFileSync("client/src/index.css", "utf8");
  const coinBlock = styles.slice(styles.indexOf("@keyframes care-coin-spin"), styles.indexOf("@keyframes care-coin-fly"));
  assert.doesNotMatch(coinBlock, /rotateY|preserve-3d/);
  assert.match(coinBlock, /\.pet-care-overlay \.care-coin::before[\s\S]*?border-radius: 50%[\s\S]*?radial-gradient/);
  assert.match(coinBlock, /-webkit-tap-highlight-color: transparent/);
  assert.doesNotMatch(source, /drop-shadow\(0 0 10px rgba\(255,210,90/);
});

test("meter theme glows stay scoped to Pet Care tracks", () => {
  const styles = css();
  for (const theme of ["hunger", "mood", "loyalty"]) {
    assert.match(styles, new RegExp(`\\.pet-care-overlay \\.pet-care-meter--${theme} \\.pet-care-meter__track \\{[\\s\\S]*?box-shadow`));
  }
  assert.doesNotMatch(styles, /(^|\n)\.pet-care-meter--(?:hunger|mood|loyalty) \.pet-care-meter__track/);
});
