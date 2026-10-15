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

test("Both pet pages require circular movement before triggering hearts", () => {
  const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
  const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(home, /g\\.travel > Math\\.PI \\* 0\\.66/);
  assert.match(care, /g\\.travel > Math\\.PI \\* 0\\.66/);
  assert.doesNotMatch(home, /g\\.pathDistance >= 46/);
  assert.doesNotMatch(care, /g\\.pathDistance >= 46/);
  assert.match(home, /data-gameplay-touch-gesture="true"/);
});
