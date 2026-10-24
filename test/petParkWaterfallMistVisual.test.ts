import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ParkEffectVisual } from "../client/src/components/ParkEffectVisual";

test("waterfall mist is an animated cloud of four visible white plumes", () => {
  const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "waterfall_mist" }));
  assert.match(markup, /park-water-effect--waterfall_mist/);
  assert.equal((markup.match(/class="park-water-mist-plume"/g) ?? []).length, 4);
  assert.match(markup, /@keyframes parkMistBillow/);
  assert.match(markup, /animation-delay: -4\.8s/);
  assert.match(markup, /translate3d\(13%, -18%, 0\)/);
  // White, smokey gradients remain bright enough to read against dark park art.
  assert.match(markup, /rgba\(255,255,255,\.88\)/);
  assert.match(markup, /rgba\(255,255,255,\.62\)/);
});

test("mist remains visible but stops animating in reduced-motion and still mode", () => {
  const still = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "waterfall_mist", reducedMotion: true }));
  assert.match(still, /park-water-effect--still/);
  assert.match(still, /\.park-water-effect--still \.park-water-mist-plume/);
  assert.match(still, /animation:none !important/);
  assert.match(still, /prefers-reduced-motion: reduce/);
  assert.equal((still.match(/class="park-water-mist-plume"/g) ?? []).length, 4);
});

test("ripple and shimmer visuals do not receive waterfall plumes", () => {
  for (const type of ["water_ripple", "water_shimmer"] as const) {
    const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type }));
    assert.doesNotMatch(markup, /class="park-water-mist-plume"/);
    assert.match(markup, new RegExp(`park-water-effect--${type}`));
  }
});
