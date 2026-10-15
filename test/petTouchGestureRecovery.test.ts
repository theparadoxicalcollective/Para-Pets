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
  assert.ok(home.includes("g.travel > Math.PI * 0.66"));
  assert.ok(care.includes("g.travel > Math.PI * 0.66"));
  assert.ok(!home.includes("g.pathDistance >= 46"));
  assert.ok(!care.includes("g.pathDistance >= 46"));
  assert.match(home, /data-gameplay-touch-gesture="true"/);
});

test("Pet Care drag click suppression never consumes its close button", () => {
  const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.ok(care.includes("suppressClickRef.current && (e.target as Element).closest"));
  assert.match(care, /data-testid="button-close-feeding"/);
});
