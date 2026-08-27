import assert from "node:assert/strict";
import test from "node:test";
import { alphaAdjustedPivot, earMotion, getHeadBobCssPercent, normalizeAnimationProfile } from "../client/src/lib/petAnimationConfig";
import { getEffectivePetLayer, isHeadGroupPart } from "../client/src/lib/petPartConfig";

test("normal ears mirror with rotation-only shared motion", () => {
  const left = earMotion("h2_left_ear_2", 1.25, "standard_ground");
  const right = earMotion("h2_right_ear_2", 1.25 - 0.28, "standard_ground");
  assert.ok(Math.abs(left) <= 0.8);
  assert.equal(left, -right);
});

test("front legs cover the body seam while side back legs remain behind", () => {
  assert.ok(getEffectivePetLayer({ partType: "left_leg", zIndex: 1 }, "front") > getEffectivePetLayer({ partType: "body", zIndex: 99 }, "front"));
  assert.ok(getEffectivePetLayer({ partType: "back_leg", zIndex: 99 }, "left") < getEffectivePetLayer({ partType: "body", zIndex: 1 }, "left"));
});

test("multi-head grouping and layers are canonical", () => {
  assert.equal(isHeadGroupPart("h3_left_ear_2"), true);
  assert.ok(getEffectivePetLayer({ partType: "h2_eyes", zIndex: 100 }) < getEffectivePetLayer({ partType: "body", zIndex: 0 }));
});

test("legacy profiles and padded PNG pivots normalize safely", () => {
  assert.equal(normalizeAnimationProfile(null, true), "standard_flying");
  assert.deepEqual(alphaAdjustedPivot(50, 100, { left: 0.2, top: 0.1, width: 0.4, height: 0.7 }, { x: 0.5, y: 1 }), { x: 0.4, y: 0.7999999999999999 });
});


test("head bob follows actual body rise without a seam-opening minimum", () => {
  assert.equal(getHeadBobCssPercent({ bodyHeight: 400, alphaHeight: 0.8 }), "-0.38%");
  assert.equal(getHeadBobCssPercent({ bodyHeight: 1000, alphaHeight: 1 }), "-0.75%");
  assert.equal(getHeadBobCssPercent({ bodyHeight: 100, alphaHeight: 0.5 }), "-0.06%");
  assert.equal(getHeadBobCssPercent({}), "-0.35%");
});
