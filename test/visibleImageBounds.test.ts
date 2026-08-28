import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearVisibleImageAnalysisCacheForTests,
  containVisibleArtwork,
  findVisibleImageBounds,
  getVisibleImageAnalysis,
} from "../client/src/lib/visibleImageBounds";

function pixels(width: number, height: number, visible: Array<{ x: number; y: number; alpha?: number }>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const pixel of visible) data[(pixel.y * width + pixel.x) * 4 + 3] = pixel.alpha ?? 255;
  return data;
}

test("30px transparent padding is excluded from visible bounds", () => {
  const data = pixels(100, 100, [
    ...Array.from({ length: 40 * 20 }, (_, index) => ({ x: 30 + index % 40, y: 30 + Math.floor(index / 40) })),
  ]);
  assert.deepEqual(findVisibleImageBounds(data, 100, 100), {
    left: 30, top: 30, right: 70, bottom: 50, width: 40, height: 20, centerX: 50, centerY: 40,
  });
});

test("equal visible objects from differently sized canvases receive equal presentation", () => {
  const compact = findVisibleImageBounds(pixels(40, 20, [{ x: 0, y: 0 }, { x: 39, y: 19 }]), 40, 20)!;
  const padded = findVisibleImageBounds(pixels(100, 80, [{ x: 30, y: 30 }, { x: 69, y: 49 }]), 100, 80)!;
  assert.deepEqual(containVisibleArtwork(compact, 88, 72), containVisibleArtwork(padded, 88, 72));
});

test("tall and wide artwork remain fully visible and centered", () => {
  const tall = containVisibleArtwork({ width: 20, height: 80 }, 88, 72);
  assert.deepEqual(tall, { width: 18, height: 72, x: 35, y: 0, scale: 0.9 });
  const wide = containVisibleArtwork({ width: 80, height: 20 }, 88, 72);
  assert.deepEqual(wide, { width: 88, height: 22, x: 0, y: 25, scale: 1.1 });
});

test("transparent images return no bounds and sub-threshold noise is ignored", () => {
  assert.equal(findVisibleImageBounds(pixels(20, 20, []), 20, 20), null);
  const data = pixels(20, 20, [{ x: 0, y: 0, alpha: 11 }, { x: 8, y: 9, alpha: 12 }]);
  assert.deepEqual(findVisibleImageBounds(data, 20, 20), {
    left: 8, top: 9, right: 9, bottom: 10, width: 1, height: 1, centerX: 8.5, centerY: 9.5,
  });
});

test("URL cache reuses successful analysis and failed analysis", async () => {
  clearVisibleImageAnalysisCacheForTests();
  let calls = 0;
  const result = { image: {} as HTMLImageElement, sourceWidth: 1, sourceHeight: 1, bounds: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, centerX: 0.5, centerY: 0.5 } };
  const analyze = async () => { calls += 1; return result; };
  assert.equal(await getVisibleImageAnalysis("same.png", analyze), result);
  assert.equal(await getVisibleImageAnalysis("same.png", analyze), result);
  assert.equal(calls, 1);

  let failures = 0;
  const fail = async () => { failures += 1; throw new Error("CORS"); };
  await assert.rejects(getVisibleImageAnalysis("blocked.png", fail));
  await assert.rejects(getVisibleImageAnalysis("blocked.png", fail));
  assert.equal(failures, 1);
});

test("jar items preserve full artwork inside the movable unit target", () => {
  const page = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const jarStart = page.indexOf("function PetCareItemShelf(");
  const jarEnd = page.indexOf("// ── Feeding Overlay", jarStart);
  assert.notEqual(jarStart, -1, "PetCare jar component must exist");
  assert.notEqual(jarEnd, -1, "PetCare jar component must end before Feeding Overlay");
  const jar = page.slice(jarStart, jarEnd);
  assert.match(jar, /className="pet-care-item-jar__item"/);
  assert.match(jar, /data-pet-care-stack-id=\{visual\.item\.stackId\}/);
  assert.match(jar, /onPointerDown=\{dragEnabled \? \(event\) => beginJarMove\(event, visual\) : undefined\}/);
  assert.match(jar, /onClick=\{!dragEnabled \? \(\) => onItemClick\(visual\.item\) : undefined\}/);
  assert.match(jar, /src=\{visual\.item\.imageUrl\}/);
  assert.match(jar, /objectFit: "contain"/);
  assert.match(jar, /pointerEvents: "none"/);
  assert.doesNotMatch(jar, /VisibleAssetImage/);
  assert.doesNotMatch(jar, /pet-care-item-shelf__quantity/);
  assert.doesNotMatch(jar, /pet-care-item-shelf__value/);
});
