import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultParkShopPlacement, flipParkShopPlacement, parkShopPriceTagFromPointer,
  parkShopPriceTagPoint, parkShopPriceTagSize, rotateParkShopPlacement,
  validParkShopPlacements, PARK_SHOP_DEFAULT_PRICE_TAG, PARK_SHOP_MAX_ITEMS,
  PARK_SHOP_ROTATION_STEP,
} from "../shared/petParkShopPlacements";

const read = (path: string) => readFileSync(path, "utf8");

test("World shop uses the same item-local price anchor, proportional tag size and rotation as Pet Park", () => {
  const initial = defaultParkShopPlacement("shop-item", 0);
  assert.deepEqual(parkShopPriceTagPoint(initial), PARK_SHOP_DEFAULT_PRICE_TAG);
  assert.equal(parkShopPriceTagSize(148), 52);
  assert.equal(parkShopPriceTagSize(74), 26);
  const point = parkShopPriceTagFromPointer(500, 20, { left: 0, top: 0, width: 148, height: 148 });
  assert.deepEqual(point, { priceTagXPct: .85, priceTagYPct: .15 });
  const moved = { ...initial, ...point };
  assert.equal(validParkShopPlacements([moved]), true);
  assert.deepEqual(parkShopPriceTagPoint(rotateParkShopPlacement(moved)),
    parkShopPriceTagPoint(moved));
  assert.deepEqual(parkShopPriceTagPoint(flipParkShopPlacement(moved)),
    parkShopPriceTagPoint(moved));
  assert.equal(rotateParkShopPlacement(initial).rotation, PARK_SHOP_ROTATION_STEP);
});

test("World renders Pet Park-style coin-only wooden tags and dedicated positioning preview", () => {
  const world = read("client/src/components/world-editor/WorldShopShelf.tsx");
  const park = read("client/src/components/PetParkShopShelf.tsx");
  for (const expected of [
    'data-testid="world-shop-price-preview"',
    'data-testid="world-shop-price-preview-art"',
    'data-testid="world-shop-price-drag-handle"',
    'data-testid="world-shop-price-on-art"',
    'data-testid="world-shop-tag-art"',
    'data-testid="world-shop-tag-coin"',
    'className="relative h-[148px] w-[148px] touch-none',
    'Drag the tag onto the image',
    'Position price tag',
  ]) assert.ok(world.includes(expected), "missing: " + expected);
  assert.match(world, /parkShopPriceTagFromPointer\(x, y, rect\)/);
  assert.match(world, /<ShopPriceTag itemBoxSize=\{148\} \/>/);
  assert.match(world, /<ShopPriceTag itemBoxSize=\{imageSize\} \/>/);
  assert.match(world, /className="pointer-events-none relative inline-block shrink-0"/);
  assert.match(world, /width: "27%", height: "27%", left: "50%", top: "61%"/);
  assert.match(park, /width: "27%", height: "27%", left: "50%", top: "61%"/);
  assert.match(world, /style=\{\{ bottom: "max\(16px, env\(safe-area-inset-bottom, 0px\)\)" \}\}/);
  assert.match(world, /style=\{\{ bottom: "max\(132px, calc\(env\(safe-area-inset-bottom, 0px\) \+ 122px\)\)" \}\}/);
  assert.match(world, /onPointerMove=\{onTagMove\} onPointerUp=\{onTagUp\}/);
  assert.match(world, /onPointerCancel=\{onTagCancel\} onLostPointerCapture=\{onTagCancel\}/);
  const tag = world.slice(world.indexOf("function ShopPriceTag"), world.indexOf("/** Pet Park-equivalent authoring"));
  assert.doesNotMatch(tag, /\.price|toLocaleString|numeric price/);
});

test("World shop item controls match Pet Park editing without losing world-only save routing", () => {
  const world = read("client/src/components/world-editor/WorldShopShelf.tsx");
  for (const action of [
    'aria-label="Smaller merchandise"', 'aria-label="Larger merchandise"',
    'aria-label="Rotate merchandise clockwise 15 degrees"',
    'aria-label="Flip merchandise horizontally"',
    'aria-label="Remove merchandise"', 'aria-label="Done editing item"',
  ]) assert.ok(world.includes(action), "missing: " + action);
  assert.match(world, /updateSelected\(rotateParkShopPlacement\)/);
  assert.match(world, /updateSelected\(flipParkShopPlacement\)/);
  assert.match(world, /aria-pressed=\{!!selected.flippedX\}/);
  assert.match(world, /Math\.max\(PARK_SHOP_MIN_SIZE, p\.size - 2\)/);
  assert.match(world, /Math\.min\(PARK_SHOP_MAX_SIZE, p\.size \+ 2\)/);
  assert.match(world, /\{ shopItemIds: nextIds, shopItemPlacements: next \}/);
  assert.match(world, /"\/api\/admin\/world-editor\/" \+ worldId \+ "\/placements\/" \+ building\.id/);
  assert.match(world, /layoutRef\.current = previous/);
  assert.doesNotMatch(world, /api\/shop\/pet-park\/buy|api\/shop\/.*\/buy|purchaseQuantity/);
  const page = read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.match(page, /onSelectionChange=\{setEditingShopItem\}/);
  assert.match(page, /shopItemEditing=\{editingShopItem\}/);
  assert.match(controls, /!props.shopItemEditing/);
  assert.match(controls, /onClick=\{\(\) => openCreator\("shop"\)\}/);
});

test("World shop stocks via same searchable, filtered two-column picker as Pet Park", () => {
  const world = read("client/src/components/world-editor/WorldShopShelf.tsx");
  const route = read("server/routes/worldSceneContent.routes.ts");
  assert.equal(PARK_SHOP_MAX_ITEMS, 80);
  assert.match(world, /data-testid="world-shop-add-item"/);
  assert.match(world, /data-testid="world-shop-picker"/);
  assert.match(world, /role="dialog" aria-modal="true" aria-label="Add items to world shop"/);
  assert.match(world, /aria-label="Search shop items"/);
  assert.match(world, /aria-label="Filter shop items"/);
  assert.match(world, /role="listbox" aria-label="Choose a shop item"/);
  assert.match(world, /role="option"/);
  assert.match(world, /defaultParkShopPlacement\(itemId, ids\.length\)/);
  assert.match(world, /ids\.filter\(id => id !== selectedId\)/);
  assert.match(world, /ids\.length >= PARK_SHOP_MAX_ITEMS/);
  assert.match(world, /q: searchTerm, type: filter/);
  assert.match(route, /type && type !== "all" \? eq\(shopItems\.type, type\) : undefined/);
  assert.match(route, /ne\(shopItems\.type, "garden_fruit"\)/);
  assert.match(route, /validParkShopPlacements\(body\.shopItemPlacements\)/);
  assert.match(route, /body\.shopItemPlacements\.some\(\(p: ParkShopPlacement\) => !activeStock\.includes\(p\.itemId\)\)/);
  assert.match(world, /onChanged\(\)/);
});

test("World can open a stocked or completely empty shop without switching purchase systems", () => {
  const world = read("client/src/components/world-editor/WorldShopShelf.tsx");
  assert.match(world, /if \(!building\.isShop\) return null/);
  assert.doesNotMatch(world, /if \(!building\.isShop \|\| !building\.shopItemIds\.length\) return null/);
  assert.match(world, /enabled: building\.isShop && showPicker/);
  assert.match(world, /enabled: building\.isShop && building\.shopItemIds\.length > 0/);
});
