import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ParkEffectVisual } from "../client/src/components/ParkEffectVisual";

test("waterfall mist renders soft drifting ground haze instead of vertical smoke streams", () => {
  const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "waterfall_mist" }));
  assert.match(markup, /park-water-effect--waterfall_mist/);
  assert.match(markup, /<svg[^>]+viewBox="0 0 240 180"/);
  assert.equal((markup.match(/class="park-mist-cloud /g) ?? []).length, 3);
  assert.match(markup, /<radialGradient/);
  assert.match(markup, /park-mist-cloud--front/);
  assert.match(markup, /<feGaussianBlur/);
  assert.match(markup, /@keyframes parkMistSpread/);
  assert.doesNotMatch(markup, /radial-gradient\(ellipse at 50% 79%/);
  assert.doesNotMatch(markup, /park-mist-wisp|parkMistDrift|park-water-mist-plume|parkMistBillow/);
});

test("each mist instance has its own SVG filter and gradients", () => {
  const markup = renderToStaticMarkup(createElement("div", null,
    createElement(ParkEffectVisual, { type: "waterfall_mist" }),
    createElement(ParkEffectVisual, { type: "waterfall_mist" }),
  ));
  const filterIds = Array.from(markup.matchAll(/<filter id="([^"]+)"/g), m => m[1]);
  assert.equal(filterIds.length, 2);
  assert.notEqual(filterIds[0], filterIds[1]);
  for (const id of filterIds) assert.ok(markup.includes(`url(#${id})`));
});

test("reduced-motion mist keeps the smoke visible but stationary", () => {
  const still = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "waterfall_mist", reducedMotion: true }));
  assert.match(still, /park-mist--still/);
  assert.match(still, /animation:none !important/);
  assert.match(still, /prefers-reduced-motion: reduce/);
  assert.match(still, /<svg/);
});

test("ripple, shimmer and vertical flow retain their own visuals rather than the mist", () => {
  for (const type of ["water_ripple", "water_shimmer", "water_flow"] as const) {
    const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type }));
    assert.doesNotMatch(markup, /park-mist-wisp|<feTurbulence/);
    assert.match(markup, new RegExp(`park-water-effect--${type}`));
  }
});

test("mist, shimmer and flow keep an irregular, transparent edge and contrast over pale art", () => {
  const mist = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "waterfall_mist" }));
  assert.match(mist, /id="[^"]+-shade"/);
  assert.match(mist, /stop-color="#247987"/);
  assert.match(mist, /<path/);
  assert.doesNotMatch(mist, /<ellipse/);

  const shimmer = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "water_shimmer" }));
  assert.match(shimmer, /park-surface-caustic--near/);
  assert.match(shimmer, /<mask id=/);
  assert.match(shimmer, /@keyframes parkSurfaceDrift/);
  assert.doesNotMatch(shimmer, /parkShimmer/);

  const flow = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "water_flow" }));
  assert.match(flow, /park-flow-stream--near/);
  assert.match(flow, /<mask id=/);
  assert.match(flow, /@keyframes parkFlowFall/);
  assert.match(flow, /prefers-reduced-motion: reduce/);
});

test("each water art layer has an isolated SVG edge mask, including indoors", () => {
  const markup = renderToStaticMarkup(createElement("div", null,
    createElement(ParkEffectVisual, { type: "water_shimmer" }),
    createElement(ParkEffectVisual, { type: "water_shimmer" }),
    createElement(ParkEffectVisual, { type: "water_flow" }),
    createElement(ParkEffectVisual, { type: "water_flow" }),
  ));
  const ids = Array.from(markup.matchAll(/<mask id="([^"]+)"/g), m => m[1]);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) assert.ok(markup.includes(`url(#${id})`));
});

test("shimmer and vertical flow can become still without disappearing", () => {
  for (const type of ["water_shimmer", "water_flow"] as const) {
    const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type, reducedMotion: true }));
    assert.match(markup, /park-water-effect--still/);
    assert.match(markup, /animation:none !important/);
    assert.match(markup, /opacity:\.8/);
  }
});
