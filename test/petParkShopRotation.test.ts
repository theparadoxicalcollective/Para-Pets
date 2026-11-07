import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultParkShopPlacement, rotateParkShopPlacement, validParkShopPlacements,
  withParkShopDefaults, PARK_SHOP_ROTATION_STEP,
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
