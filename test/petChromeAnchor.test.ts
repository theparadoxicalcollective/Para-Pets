import assert from "node:assert/strict";
import test from "node:test";
import { petChromeAnchorOffset } from "../client/src/lib/petChromeAnchor";

test("saved Admin anchor scales with the authored scene on phones and tablets", () => {
  const anchor = { x: 12, y: -8 };
  for (const width of [320, 390, 768, 834, 1024]) {
    assert.deepEqual(petChromeAnchorOffset(anchor, width), { x: width * 0.12, y: width * -0.08 });
  }
});
test("invalid geometry fails closed rather than producing NaN positions", () => {
  assert.deepEqual(petChromeAnchorOffset({ x: 10, y: 5 }, NaN), { x: 0, y: 0 });
});
