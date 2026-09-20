import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateWorldDragPosition, worldPositionsDiffer } from "../client/src/lib/worldNpcPlacement";

test("NPC drag math stays in world percentage space on a phone-sized rendered map", () => {
  const position = calculateWorldDragPosition(
    { x: 40, y: 40 },
    { x: 100, y: 200 },
    { x: 154, y: 272 },
    { width: 540, height: 720 },
  );

  assert.equal(position.x, 50);
  assert.equal(position.y, 50);
});

test("the same proportional drag produces the same saved coordinates on a larger display", () => {
  const phone = calculateWorldDragPosition(
    { x: 31, y: 44 },
    { x: 50, y: 80 },
    { x: 104, y: 152 },
    { width: 540, height: 720 },
  );
  const tablet = calculateWorldDragPosition(
    { x: 31, y: 44 },
    { x: 100, y: 160 },
    { x: 208, y: 304 },
    { width: 1080, height: 1440 },
  );

  assert.deepEqual(phone, tablet);
  assert.deepEqual(phone, { x: 41, y: 54 });
});

test("NPC drag coordinates keep the world's existing admin overscan limits", () => {
  const position = calculateWorldDragPosition(
    { x: 100, y: -5 },
    { x: 0, y: 0 },
    { x: 900, y: -900 },
    { width: 500, height: 500 },
  );

  assert.deepEqual(position, { x: 110, y: -10 });
});

test("server verification ignores harmless floating point noise but catches a real snap-back", () => {
  assert.equal(worldPositionsDiffer({ x: 42, y: 63 }, { x: 42.04, y: 62.96 }), false);
  assert.equal(worldPositionsDiffer({ x: 40, y: 40 }, { x: 42, y: 63 }), true);
});


test("world NPC art keeps a grounded shadow and a smooth bottom-anchored breathing idle", () => {
  const source = readFileSync("client/src/components/WorldNpcPlacementOverlay.tsx", "utf8");
  assert.match(source, /@keyframes paraNpcBreathe/);
  assert.match(source, /0%, 100% \{ transform: translate3d\(0,0,0\) scale3d\(1,1,1\); \}/);
  assert.match(source, /50% \{ transform: translate3d\(0,\.16%,0\) scale3d\(1\.003,\.984,1\); \}/);
  assert.match(source, /animation: paraNpcBreathe 4\.8s cubic-bezier\(\.42,0,\.58,1\) infinite/);
  assert.match(source, /transform-origin: 50% 100%/);
  assert.match(source, /will-change: transform/);
  assert.match(source, /backface-visibility: hidden/);
  assert.match(source, /drop-shadow\(0 7px 9px rgba\(0,0,0,\.68\)\)/);
  assert.match(source, /drop-shadow\(0 0 2px rgba\(255,244,214,\.18\)\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});
