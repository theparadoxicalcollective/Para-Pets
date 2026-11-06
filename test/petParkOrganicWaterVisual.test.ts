import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ParkEffectVisual } from "../client/src/components/ParkEffectVisual";
import { PARK_WATER_EFFECT_OPTIONS, isParkWaterEffect } from "../shared/petParkEffects";
import { sanitizeParkInteriorEffects } from "../shared/petParkRooms";

const visual = readFileSync("client/src/components/ParkEffectVisual.tsx", "utf8");

test("still-water shimmer uses broken reflective contours with irregular faded edges", () => {
  const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "water_shimmer" }));
  assert.match(markup, /park-water-effect--water_shimmer/);
  assert.match(markup, /viewBox="0 0 240 160"/);
  assert.match(markup, /<radialGradient/);
  assert.match(markup, /<mask /);
  assert.match(markup, /mask="url\(#/);
  assert.match(markup, /park-surface-caustic--far/);
  assert.match(markup, /park-surface-caustic--near/);
  assert.match(markup, /stroke="#1c7a88"/);
  assert.match(markup, /stroke="#e1ffff"/);
  assert.match(markup, /@keyframes parkSurfaceDrift/);
  assert.doesNotMatch(visual, /parkShimmer|park-water-effect--water_shimmer:before/);
});

test("vertical flow is an independent effect with layered falling streaks and feathered margins", () => {
  const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "water_flow" }));
  assert.match(markup, /park-water-effect--water_flow/);
  assert.match(markup, /viewBox="0 0 160 240"/);
  assert.match(markup, /<mask /);
  assert.match(markup, /mask="url\(#/);
  assert.match(markup, /park-flow-stream--far/);
  assert.match(markup, /park-flow-stream--near/);
  assert.match(markup, /stroke="#287d8a"/);
  assert.match(markup, /stroke="#e6ffff"/);
  assert.match(markup, /@keyframes parkFlowFall/);
  assert.ok(isParkWaterEffect("water_flow"));
  assert.ok(PARK_WATER_EFFECT_OPTIONS.some(option => option.type === "water_flow" && option.interiorSize > 0));
  const inside = sanitizeParkInteriorEffects([{ id: "flow-1", type: "water_flow", x: 0.4, y: 0.6, size: 24 }]);
  assert.equal(inside[0]?.type, "water_flow");
});

test("mist uses softly blurred irregular shapes and aqua contrast on bright waterfall artwork", () => {
  const markup = renderToStaticMarkup(createElement(ParkEffectVisual, { type: "waterfall_mist" }));
  assert.match(markup, /stop-color="#247987"/);
  assert.match(markup, /stop-color="#f6fffc"/);
  assert.match(markup, /<path /);
  assert.match(markup, /<feGaussianBlur/);
  assert.doesNotMatch(markup, /<ellipse/);
});

test("water instances have independent fade masks and honor reduced-motion", () => {
  for (const type of ["water_shimmer", "water_flow"] as const) {
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(ParkEffectVisual, { type }),
      createElement(ParkEffectVisual, { type }),
    ));
    const ids = Array.from(markup.matchAll(/<mask id="([^"]+)"/g), match => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) assert.ok(markup.includes('mask="url(#' + id + ')"'));
    const still = renderToStaticMarkup(createElement(ParkEffectVisual, { type, reducedMotion: true }));
    assert.match(still, /park-water-effect--still/);
    assert.match(still, /animation:none !important/);
    assert.match(still, /prefers-reduced-motion: reduce/);
  }
});

test("existing ripple, drop, and home outdoor effects keep their original render branches", () => {
  assert.match(visual, /park-water-effect--water_ripple:before/);
  assert.match(visual, /park-water-effect--water_drop:before/);
  assert.match(visual, /isParkOutdoorEffect\(type\)/);
  assert.match(visual, /<HomeOutdoorEffectVisual /);
});
