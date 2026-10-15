import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pet Care drag ghost does not hide the element holding pointer capture", () => {
  const source = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(source, /captureTargetRef\.current\.style\.opacity = "0"/);
  assert.match(source, /captureTarget\.style\.opacity = ""/);
  assert.doesNotMatch(source, /captureTargetRef\.current\.style\.visibility = "hidden"/);
  assert.match(source, /captureTarget\.setPointerCapture\?\.\(e\.pointerId\)/);
});

test("Active Pet recognizes a short rub and owns its touch stream", () => {
  const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");
  assert.match(source, /g\.pathDistance \+= Math\.hypot/);
  assert.match(source, /g\.pathDistance >= 46 && performance\.now\(\) - g\.startedAt >= 80/);
  assert.match(source, /data-gameplay-touch-gesture="true"/);
  assert.match(source, /target\.setPointerCapture\?\.\(e\.pointerId\)/);
});
