import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultParkShopPlacement, flipParkShopPlacement, rotateParkShopPlacement, validParkShopPlacements,
  withParkShopDefaults, PARK_SHOP_ROTATION_STEP,
  parkShopPriceTagPoint, parkShopPriceTagFromPointer, parkShopPriceTagSize,
  PARK_SHOP_DEFAULT_PRICE_TAG, PARK_SHOP_PRICE_TAG_PREVIEW_BOX_SIZE,
} from "../shared/petParkShopPlacements";

const read = (filename: string) => readFileSync(filename, "utf8");

test("shop item rotation is backwards-compatible and validated in existing JSON positions", () => {
  const legacy = { itemId: "scythe", xPct: .52, yPct: .42, size: 12 };
  assert.equal(validParkShopPlacements([legacy]), true, "existing shops have no rotation field");
  assert.equal(PARK_SHOP_ROTATION_STEP, 15);
  assert.equal(defaultParkShopPlacement("hoe", 0).rotation, 0);
  assert.equal(defaultParkShopPlacement("hoe", 0).flippedX, false);
  assert.deepEqual(rotateParkShopPlacement(legacy), { ...legacy, rotation: 15 });
  const nearlyFull = { ...legacy, rotation: 345 };
  assert.equal(rotateParkShopPlacement(nearlyFull).rotation, 0, "full rotations wrap");
  assert.equal(rotateParkShopPlacement({ ...legacy, rotation: 90 }).rotation, 105);
  for (const bad of [-1, 360, 720, 15.5, null, "15", {}, NaN, Infinity]) {
    assert.equal(validParkShopPlacements([{ ...legacy, rotation: bad }]), false,
      "reject invalid rotation " + String(bad));
  }
  assert.equal(validParkShopPlacements([{ ...legacy, rotation: 105 }]), true);
  assert.equal(validParkShopPlacements([{ ...legacy, rotation: 90 }, { ...legacy, rotation: 0 }]), false,
    "item IDs must remain unique");
  assert.deepEqual(withParkShopDefaults(["scythe"], [nearlyFull]), [nearlyFull],
    "saved rotation is retained without changing positions, sizing or image coordinates");
});

test("shop artwork flip preserves existing item placement, tag anchor and legacy JSON", () => {
  const legacy = { itemId: "hoe", xPct: .54, yPct: .36, size: 10 };
  assert.equal(validParkShopPlacements([legacy]), true);
  const mirrored = flipParkShopPlacement(legacy);
  assert.deepEqual(mirrored, { ...legacy, flippedX: true });
  assert.deepEqual(flipParkShopPlacement(mirrored), { ...legacy, flippedX: false });
  assert.equal(validParkShopPlacements([mirrored]), true);
  for (const bad of ["true", 1, null, [], {}]) {
    assert.equal(validParkShopPlacements([{ ...legacy, flippedX: bad }]), false);
  }
  const placed = { ...mirrored, rotation: 45, priceTagXPct: .42, priceTagYPct: .59 };
  assert.deepEqual(flipParkShopPlacement(placed), { ...placed, flippedX: false },
    "flip does not change rotation, size, position or tag coordinates");
  assert.deepEqual(withParkShopDefaults(["hoe"], [placed]), [placed]);
});

test("shop rotation saves through existing building PATCH, never a separate room coordinate or storage path", () => {
  const editor = read("client/src/components/PetParkShopShelf.tsx");
  const routes = read("server/routes/petParkAdmin.routes.ts");
  const scene = read("client/src/pages/PetParkPage.tsx");
  assert.match(editor, /rotateParkShopPlacement\(placement\)/);
  assert.match(editor, /changeStock\(ids, next\)/);
  assert.match(editor, /shopItemIds: next\.ids, shopItemPlacements: next\.layout/);
  assert.match(editor, /data-testid="pet-park-shop-rotate"/);
  assert.match(editor, /aria-label="Rotate merchandise clockwise 15 degrees"/);
  assert.match(editor, /disabled=\{save\.isPending\}/);
  assert.match(editor, /data-testid="pet-park-shop-rotation"/);
  assert.ok(editor.includes("rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flippedX ? -1 : 1})"));
  assert.ok(editor.includes("rotate(${editPlacement.rotation ?? 0}deg) scaleX(${editPlacement.flippedX ? -1 : 1})"));
  assert.match(editor, /flipParkShopPlacement\(placement\)/);
  assert.match(editor, /data-testid="pet-park-shop-flip"/);
  assert.match(editor, /aria-label="Flip merchandise horizontally"/);
  assert.match(editor, /aria-pressed=\{!!editPlacement\?\.flippedX\}/);
  assert.match(editor, /style=\{\{ left: placement\.xPct \* imageWidth, top: placement\.yPct \* imageHeight/);
  assert.match(editor, /width: dimension, height: dimension, transform: "translate\(-50%,-50%\)"/);
  assert.match(editor, /safeSetPointerCapture/);
  assert.match(routes, /if \(!validParkShopPlacements\(body\.shopItemPlacements\)\)/);
  assert.match(routes, /updates\.shopItemPlacements = body\.shopItemPlacements/);
  assert.match(scene, /placements=\{activeBuilding\.shopItemPlacements \?\? \[\]\}/);
});

test("shop item names disappear only from the room artwork, not search, editing or checkout", () => {
  const editor = read("client/src/components/PetParkShopShelf.tsx");
  const roomItems = editor.slice(editor.indexOf("data-testid=\"pet-park-shop-merchandise\""),
    editor.indexOf("{canEditPark && editItem"));
  assert.doesNotMatch(roomItems, /\{item\.name\}/,
    "no text labels on scene merchandise (including selected items)");
  assert.match(editor, /aria-label=\{canEditPark \? "Place " \+ item\.name : "Buy " \+ item\.name\}/,
    "artwork remains individually identified for screen readers");
  assert.match(editor, /\{editItem\.name\}/, "the bottom editor still identifies the selected item");
  assert.match(editor, /\{item\.name\}/, "the filtered admin picker still shows item names");
  assert.match(editor, /<h2[^>]*>\{selectedBuy\.name\}<\/h2>/,
    "buyer sees the item name and details after tapping its artwork");
});

test("shop prices use bounded image-local tag positions without changing merchandise", () => {
  const legacy = { itemId: "hoe", xPct: .52, yPct: .46, size: 12, rotation: 45 };
  assert.deepEqual(parkShopPriceTagPoint(legacy), PARK_SHOP_DEFAULT_PRICE_TAG,
    "old shops display a lower-right default without migrations");
  assert.deepEqual(parkShopPriceTagPoint(defaultParkShopPlacement("hoe", 0)), PARK_SHOP_DEFAULT_PRICE_TAG);
  const rect = { left: 20, top: 60, width: 200, height: 180 };
  const point = parkShopPriceTagFromPointer(90, 100, rect);
  assert.deepEqual(point, { priceTagXPct: .35, priceTagYPct: 40 / 180 });
  const positioned = { ...legacy, ...point };
  assert.equal(validParkShopPlacements([positioned]), true);
  assert.deepEqual(parkShopPriceTagPoint(positioned), { xPct: .35, yPct: 40 / 180 });
  assert.deepEqual(rotateParkShopPlacement(positioned), { ...positioned, rotation: 60 },
    "rotating the artwork retains the price tag coordinates");
  assert.deepEqual(withParkShopDefaults(["hoe"], [positioned]), [positioned]);
  assert.deepEqual(parkShopPriceTagFromPointer(-999, 3000, rect),
    { priceTagXPct: .15, priceTagYPct: .85 });
  for (const broken of [
    { priceTagXPct: -1, priceTagYPct: .5 }, { priceTagXPct: 1.01, priceTagYPct: .5 },
    { priceTagXPct: .4, priceTagYPct: -.01 }, { priceTagXPct: .4, priceTagYPct: .99 },
    { priceTagXPct: .4 }, { priceTagYPct: .6 },
    { priceTagXPct: null, priceTagYPct: .5 },
    { priceTagXPct: "0.5", priceTagYPct: .5 },
    { priceTagXPct: NaN, priceTagYPct: .5 },
  ]) assert.equal(validParkShopPlacements([{ ...legacy, ...broken }]), false);
});

test("shop sticker uses the identical proportional size and anchor for editor and buyers", () => {
  const preview = PARK_SHOP_PRICE_TAG_PREVIEW_BOX_SIZE;
  assert.equal(preview, 148);
  assert.equal(parkShopPriceTagSize(preview), 52);
  for (const roomHeight of [844, 1194, 1700]) {
    for (const merchandiseSize of [5, 8, 12, 16, 25]) {
      const artworkBox = roomHeight * merchandiseSize / 100;
      assert.ok(Math.abs(parkShopPriceTagSize(artworkBox) / artworkBox -
        parkShopPriceTagSize(preview) / preview) < 1e-12,
      "player and preview stickers share one ratio, including very small items");
    }
  }
  const editor = read("client/src/components/PetParkShopShelf.tsx");
  assert.match(editor, /const tagSize = parkShopPriceTagSize\(itemBoxSize\)/);
  assert.match(editor, /<ShopPriceTag itemBoxSize=\{dimension\} \/>/);
  assert.match(editor, /<ShopPriceTag itemBoxSize=\{148\} \/>/);
  assert.match(editor, /style=\{priceTagAnchorStyle\(placement\)\}/);
  assert.match(editor, /style=\{priceTagAnchorStyle\(editPlacement\)\}/);
  assert.match(editor, /ring-1 ring-inset/, "preview's visual border may not shrink the item's coordinate box");
  assert.doesNotMatch(editor, /Math\.max\(27, Math\.min\(54, dimension \* \.42\)\)/,
    "fixed bounds previously changed the relative sticker size on small and large items");
});

test("admin price preview and shopper coin-only wooden tags reuse the authenticated merchandise placement", () => {
  const editor = read("client/src/components/PetParkShopShelf.tsx");
  const server = read("server/routes/petParkAdmin.routes.ts");
  const player = read("server/routes/petParkPlayer.routes.ts");
  assert.match(editor, /data-testid="pet-park-shop-price-preview"/);
  assert.match(editor, /data-testid="pet-park-shop-price-preview-art"/);
  assert.match(editor, /data-testid="pet-park-shop-price-drag-handle"/);
  assert.match(editor, /onPointerMove=\{onPriceTagMove\} onPointerUp=\{onPriceTagUp\}/);
  assert.match(editor, /parkShopPriceTagFromPointer\(clientX, clientY, rect\)/);
  assert.match(editor, /changeStock\(ids, layout\.map/);
  assert.match(editor, /data-testid="pet-park-shop-price-on-art"/);
  assert.match(editor, /<ShopPriceTag itemBoxSize=\{dimension\} \/>/);
  assert.match(editor, /<ShopPriceTag itemBoxSize=\{148\} \/>/);
  assert.match(editor, /src=\{PARK_SHOP_PRICE_TAG_IMAGE\}/);
  assert.match(editor, /from "@assets\/price_tag\.png\?url"/);
  assert.match(editor, /const tagSize = parkShopPriceTagSize\(itemBoxSize\)/);
  const tag = editor.slice(editor.indexOf("function ShopPriceTag"), editor.indexOf("/** Merchandise is positioned"));
  assert.doesNotMatch(tag, /price\.toLocaleString|\{price\}|bg-\[#173c27\]/,
    "wood tag has only artwork and coin; no numeric price or old CSS badge");
  assert.match(editor, /editPlacement && !isDraggingMerchandise/);
  assert.match(editor, /setIsDraggingMerchandise\(true\)/);
  assert.match(editor, /setIsDraggingMerchandise\(false\)/);
  assert.match(editor, /transform: "translate\(-50%, -50%\)"/);
  assert.ok(editor.includes("Move price tag for"));
  assert.match(editor, /selectedBuy\.price\.toLocaleString\(\)/);
  assert.match(editor, /selectedBuy\.name/);
  assert.match(editor, /src=\{PARA_PETS_COIN_IMAGE\}/);
  assert.match(server, /validParkShopPlacements\(body\.shopItemPlacements\)/);
  assert.match(player, /price: shopItems\.price/);
  assert.doesNotMatch(editor, /priceTagMutation|\/api\/pet-park\/price-tag/);
});
