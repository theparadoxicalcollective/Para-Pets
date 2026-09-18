import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseDocumentLayout, WIDE_BREAKPOINT } from "../client/src/lib/stage";

test("Hub uses a normal document viewport on tablet and desktop", () => {
  assert.equal(shouldUseDocumentLayout("/hub", WIDE_BREAKPOINT), true);
  assert.equal(shouldUseDocumentLayout("/hub", 1440), true);
});

test("Hub preserves the existing phone layout below the breakpoint", () => {
  assert.equal(shouldUseDocumentLayout("/hub", WIDE_BREAKPOINT - 1), false);
  assert.equal(shouldUseDocumentLayout("/hub", 390), false);
});

test("gameplay routes remain in the stable portrait stage on desktop", () => {
  for (const path of ["/", "/world/volcanic", "/coins", "/forum"]) {
    assert.equal(shouldUseDocumentLayout(path, 1440), false);
  }
});
