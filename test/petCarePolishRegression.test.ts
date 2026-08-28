import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = () => readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const css = () => readFileSync("client/src/petCarePolish.css", "utf8");

test("React is the only Pet Care drag owner and portals one ghost", () => {
  const source = page();
  assert.equal(existsSync("client/src/petCarePolish.ts"), false);
  assert.equal(existsSync("client/src/petCarePolishBootstrap.ts"), false);
  assert.match(source, /createPortal\([\s\S]*?pet-care-drag-ghost[\s\S]*?getStagePortalTarget\(\)/);
  assert.match(source, /dragPositionRef\.current = clientToStagePortal\(x, y\)/);
  assert.equal(source.match(/className="pet-care-drag-ghost"/g)?.length, 1);
  assert.match(source, /onLostPointerCapture=\{dragEnabled \? onItemPointerCancel/);
  assert.match(source, /cancelAnimationFrame\(dragFrameRef\.current\)/);
});

test("jar visuals keep stable unit identity while preserving stack selection", () => {
  const source = page();
  assert.match(source, /key: `\$\{entry\.item\.stackId\}::\$\{ordinal\}`/);
  assert.match(source, /key=\{visual\.key\}/);
  assert.match(source, /data-pet-care-stack-id=\{visual\.item\.stackId\}/);
  assert.match(source, /const isSelected = selectedStackId === visual\.item\.stackId/);
  assert.doesNotMatch(source, /data-pet-care-drag-source/);
});

test("stack quantity expands into one-consumable jar visuals", () => {
  const source = page();
  assert.match(source, /remaining: Math\.max\(0, Math\.floor\(Number\(item\.displayQuantity \?\? item\.quantity \?\? 1\)\)\)/);
  assert.match(source, /item: \{ \.\.\.entry\.item, quantity: 1, displayQuantity: 1 \}/);
  assert.match(source, /while \(units\.length < PET_CARE_JAR_VISUAL_CAPACITY\)/);
  assert.doesNotMatch(source, /pet-care-item-shelf__quantity/);
  assert.doesNotMatch(source, /MutationObserver|getQueryCache\(\)\.subscribe|data-pet-care-stack-quantity/);
  assert.match(source, /feedMutation\.mutateAsync\(\{ itemInventoryId: drag\.inventoryId \}\)/);
});

test("normal mode arbitrates pointer taps and drags while explicit fallback retains clicks", () => {
  const source = page();
  assert.match(source, /onClick=\{!dragEnabled \? \(\) => onItemClick\(visual\.item\) : undefined\}/);
  assert.match(source, /onClick=\{applySelectedCareItem\}/);
  assert.match(source, /gesture\.intent === "pending"\) selectCareItem\(gesture\.item\)/);
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
