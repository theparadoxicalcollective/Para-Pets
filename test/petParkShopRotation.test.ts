import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultParkShopPlacement, rotateParkShopPlacement, validParkShopPlacements,
  withParkShopDefaults, PARK_SHOP_ROTATION_STEP,
  parkShopPriceTagPoint, parkShopPriceTagFromPointer, PARK_SHOP_DEFAULT_PRICE_TAG,
} from "../shared/petParkShopPlacements";

const read = (filename: string) => readFileSync(filename, "utf8");

test("shop item rotation is backwards-compatible and validated in existing JSON positions", () => {
  const legacy = { itemId: "scythe", xPct: .52, yPct: .42, size: 12 };
  assert.equal(validParkShopPlacements([legacy]), true, "existing shops have no rotation field");
  assert.equal(PARK_SHOP_ROTATION_STEP, 15);
  assert.equal(defaultParkShopPlacement("hoe", 0).rotation, 0);
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
  assert.match(editor, /transform: `rotate\(\$\{placement\.rotation \?\? 0\}deg\)`/);
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

test("admin price preview and shopper stickers reuse the authenticated merchandise placement", () => {
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
  assert.match(editor, /<ShopPriceTag price=\{item\.price\} \/>/);
  assert.match(editor, /<ShopPriceTag price=\{editItem\.price\} \/>/);
  assert.match(editor, /transform: "translate\(-50%, -50%\)"/);
  assert.ok(editor.includes("Move price tag for"));
  assert.match(editor, /price\.toLocaleString\(\)/);
  assert.match(editor, /src=\{PARA_PETS_COIN_IMAGE\}/);
  assert.match(server, /validParkShopPlacements\(body\.shopItemPlacements\)/);
  assert.match(player, /price: shopItems\.price/);
  assert.doesNotMatch(editor, /priceTagMutation|\/api\/pet-park\/price-tag/);
});
