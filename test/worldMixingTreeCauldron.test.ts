import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("WorldPage delegates Mixing Tree cauldron UI to extracted components", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /import \{ CauldronOverlay, CauldronPanel \} from "@\/components\/world\/MixingTreeCauldron"/,
  );
  assert.match(worldPage, /<CauldronOverlay/);
  assert.match(worldPage, /<CauldronPanel/);

  assert.doesNotMatch(worldPage, /function CauldronOverlay/);
  assert.doesNotMatch(worldPage, /function CauldronPanel/);
  assert.doesNotMatch(worldPage, /mixingTreeCauldronImg/);
});

test("extracted cauldron overlay preserves admin move and resize behavior", () => {
  const source = read("client/src/components/world/MixingTreeCauldron.tsx");

  assert.match(source, /export function CauldronOverlay/);
  assert.match(source, /data-testid="cauldron-mixing-tree"/);
  assert.match(source, /data-testid="cauldron-resize-handle"/);
  assert.match(source, /setPointerCapture\(e\.pointerId\)/);
  assert.match(source, /releasePointerCapture\(e\.pointerId\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(100, s\.startX \+ dxPct\)\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(100, s\.startY - dyPct\)\)/);
  assert.match(source, /Math\.max\(10, Math\.min\(90, s\.startSize \+ dxPct\)\)/);
  assert.match(source, /onCommit\(draft\)/);
});

test("extracted cauldron panel preserves brew, clear, recipe, ingredient, and touch flows", () => {
  const source = read("client/src/components/world/MixingTreeCauldron.tsx");

  assert.match(source, /export function CauldronPanel/);
  assert.match(source, /const CAULDRON_CAPACITY = 2/);
  assert.match(source, /data-testid="button-brew-cauldron"/);
  assert.match(source, /data-testid="button-clear-cauldron"/);
  assert.match(source, /data-testid="button-close-cauldron"/);
  assert.equal(source.includes("button-recipe-scroll-${item.inventoryId}"), true);
  assert.equal(source.includes("div-ingredient-${ing.inventoryId}"), true);
  assert.match(source, /handleItemTouchStart/);
  assert.match(source, /handleItemTouchMove/);
  assert.match(source, /handleItemTouchEnd/);
  assert.match(source, /dispatchToCauldron\(item\.inventoryId, item\.itemType\)/);
  assert.equal(source.includes("Only ${CAULDRON_CAPACITY} ingredients at a time. Clear it to brew."), true);
});

test("WorldPage keeps cauldron data ownership and server mutations unchanged", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(worldPage, /queryKey: \["\/api\/cauldron\/layout"\]/);
  assert.match(worldPage, /apiRequest\("PATCH", "\/api\/admin\/cauldron\/layout", payload\)/);
  assert.match(worldPage, /queryKey: \["\/api\/cauldron\/contents"\]/);
  assert.match(worldPage, /apiRequest\("POST", "\/api\/cauldron\/contents", \{ inventoryId \}\)/);
  assert.match(worldPage, /apiRequest\("DELETE", "\/api\/cauldron\/contents"\)/);
  assert.match(worldPage, /apiRequest\("POST", "\/api\/cauldron\/brew"\)/);
  assert.match(worldPage, /apiRequest\("POST", "\/api\/recipes\/unlock", \{ inventoryId \}\)/);
});
