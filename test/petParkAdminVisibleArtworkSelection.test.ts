import assert from "node:assert/strict";
import test from "node:test";
import { pickParkAdminArtwork } from "../client/src/lib/petParkAdminSelection";

type TestBox = { left: number; top: number; width: number; height: number };
function box(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}
function runWithMask(run: (createNode: (id: string, kind: "building"|"item", z: number, b: TestBox,
  src?: "large"|"small") => any) => void) {
  const originalDocument = (globalThis as any).document;
  (globalThis as any).document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => {
        let source = "";
        return {
          drawImage(image: { currentSrc: string }) { source = image.currentSrc; },
          getImageData() {
            const rgba = new Uint8ClampedArray(96 * 96 * 4);
            for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
              const visible = source.includes("small") || (x >= 19 && x < 77 && y >= 19 && y < 77);
              if (visible) rgba[(y * 96 + x) * 4 + 3] = 255;
            }
            return { data: rgba };
          },
        };
      },
    }),
  };
  try {
    const createNode = (id: string, kind: "building" | "item", z: number, b: TestBox,
      src: "large" | "small" = "large") => ({
      dataset: { parkObjectId: id, parkObjectKind: kind },
      style: { zIndex: String(z) },
      getBoundingClientRect: () => box(b.left, b.top, b.width, b.height),
      querySelector: () => ({
        complete: true, naturalWidth: b.width, naturalHeight: b.height,
        currentSrc: "test:///park-admintap-" + src + "-" + id + ".png",
        src: "test:///park-admintap-" + src + "-" + id + ".png",
        getBoundingClientRect: () => box(b.left, b.top, b.width, b.height),
      }),
    });
    run(createNode);
  } finally {
    (globalThis as any).document = originalDocument;
  }
}

test("admin taps pass through transparent foreground PNG into smaller visible decor", () => {
  runWithMask(make => {
    // Lower item is a 44px decoration sitting inside the transparent upper-
    // right margin of a large tree with a higher, front-facing depth index.
    const tree = make("tree", "building", 5_100_000, { left: 100, top: 100, width: 200, height: 200 });
    const flower = make("flower", "item", 5_000_000, { left: 264, top: 112, width: 44, height: 44 }, "small");
    const scene = { querySelectorAll: () => [flower, tree] } as any;
    const objects = { tree: { flipped: false }, flower: { kind: "decor", flipped: false } } as const;
    const lookup = (_kind: string, id: string) => objects[id as keyof typeof objects] ?? null;
    assert.deepEqual(
      (() => {
        const hit = pickParkAdminArtwork(scene, 283, 133, lookup);
        return hit && { kind: hit.kind, id: hit.id };
      })(),
      { kind: "item", id: "flower" },
      "the top image's transparent padding cannot steal the smaller object's tap");
    assert.deepEqual(
      (() => {
        const hit = pickParkAdminArtwork(scene, 205, 205, lookup);
        return hit && { kind: hit.kind, id: hit.id };
      })(),
      { kind: "building", id: "tree" },
      "real painted pixels of a nearer building still win");
    assert.equal(pickParkAdminArtwork(scene, 110, 110, lookup), null,
      "transparent upper art with no underlying object behaves like empty grass");
    assert.equal(pickParkAdminArtwork(scene, 15, 15, lookup), null);
  });
});

test("depth and flipped alpha sampling are respected without rewriting placements", () => {
  runWithMask(make => {
    const a = make("front", "item", 20, { left: 80, top: 80, width: 100, height: 100 });
    const b = make("back", "item", 10, { left: 80, top: 80, width: 100, height: 100 }, "small");
    const scene = { querySelectorAll: () => [a, b] } as any;
    const lookup = (_kind: string, id: string) => ({ kind: "decor", flipped: id === "front" });
    assert.equal(pickParkAdminArtwork(scene, 130, 130, lookup)?.id, "front");
    assert.equal(pickParkAdminArtwork(scene, 84, 84, lookup)?.id, "back");
  });
});

test("scene uses one admin capture selector and preserves existing double-tap/drag workflow", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const page = fs.readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(page, /onPointerDownCapture=\{e => \{/);
  assert.match(page, /pickParkAdminArtwork\(artwork, e\.clientX, e\.clientY/);
  assert.match(page, /startPlacement\(e, hit\.kind, object, hit\.image\)/);
  assert.match(page, /e\.stopPropagation\(\);\s*\}\}\s*onPointerMoveCapture=/);
  assert.match(page, /onPointerMoveCapture=\{e => \{/);
  assert.match(page, /if \(placementPointer\.current\?\.id === e\.pointerId\) movePlacement\(e\)/);
  assert.match(page, /onPointerUpCapture=\{e => \{/);
  assert.match(page, /endPlacement\(e\)/);
  assert.match(page, /lastObjectTap\.current/);
  assert.match(page, /Date\.now\(\) - previous\.at < 400/);
  assert.match(page, /safeSetPointerCapture\(e\.currentTarget, e\.pointerId\)/);
  assert.match(page, /data-park-object-id=\{building\.id\}/);
  assert.match(page, /data-park-object-id=\{item\.id\}/);
  assert.match(page, /if \(!hit\) return; \/\/ transparent area behaves like empty grass/);
  assert.match(page, /target\.closest\("\[data-park-pet\]"\)/,
    "admin selection must not steal pet interactions");
  assert.match(page, /if \(!scene\?\.canEditPark \|\| paintMode \|\| showCreator \|\| activeBuilding/);
});
