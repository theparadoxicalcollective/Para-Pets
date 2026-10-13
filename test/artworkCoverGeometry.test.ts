import assert from "node:assert/strict";
import test from "node:test";
import { coverArtworkPoint } from "../client/src/lib/artworkCoverGeometry";

test("portrait artwork cover mapping uses intrinsic pixels", () => {
  assert.deepEqual(coverArtworkPoint({ width: 1440, height: 2560 }, { left: 0, top: 0, width: 360, height: 640 }, { x: 720, y: 1280 }), { x: 180, y: 320 });
});

test("wide viewport horizontal crop keeps artwork center aligned", () => {
  assert.deepEqual(coverArtworkPoint({ width: 1440, height: 2560 }, { left: 10, top: 20, width: 800, height: 600 }, { x: 720, y: 1280 }), { x: 410, y: 20 + 1280 * (800 / 1440) });
});

test("tall viewport cover mapping keeps center-top image alignment", () => {
  assert.deepEqual(coverArtworkPoint({ width: 1000, height: 1000 }, { left: 25, top: 35, width: 400, height: 800 }, { x: 500, y: 500 }), { x: 225, y: 435 });
});

test("invalid measurements do not produce NaN positions", () => {
  assert.equal(coverArtworkPoint({ width: 0, height: 100 }, { left: 0, top: 0, width: 400, height: 800 }, { x: 20, y: 30 }), null);
  assert.equal(coverArtworkPoint({ width: 100, height: 100 }, { left: 0, top: 0, width: 0, height: 800 }, { x: 20, y: 30 }), null);
});
