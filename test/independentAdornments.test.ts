import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeCostumePlacements, type CostumePlacement } from "../shared/costumeFeature";
import { costumePlacementsSchema } from "../shared/costumeSchema";
import { ADORNMENT_ANIMATIONS, adornmentMotion } from "../shared/adornmentAnimation";
import { changeCostumePivot, detachCostumePlacement, getCostumeCanvasPosition, getCostumePlacementAnchorPoint, getDraggedCostumePosition } from "../client/src/lib/costumePlacement";

const fitting: CostumePlacement = { view: "front", anchorPart: "independent", posX: 500, posY: 500, width: 200, height: 100, pivotX: 50, pivotY: 50, rotation: 25, flipX: true, depth: "front" };

test("independent placement renders and drags without any pet part", () => {
  assert.deepEqual(getCostumeCanvasPosition(null, fitting), { left: 400, top: 450 });
  const anchor = getCostumePlacementAnchorPoint(undefined, fitting)!;
  assert.deepEqual(anchor, { x: 0, y: 0 });
  assert.deepEqual(getDraggedCostumePosition({ x: 460, y: 510 }, { offsetX: 10, offsetY: 10 }, anchor, fitting), { posX: 550, posY: 550 });
  const resizedPetPart = { posX: 90, posY: 10, width: 800, height: 200 };
  assert.deepEqual(getCostumeCanvasPosition(resizedPetPart, fitting), getCostumeCanvasPosition(null, fitting));
});

test("detaching preserves the authored position, rotation and flip; existing fittings stay unchanged", () => {
  const old = { ...fitting, anchorPart: "left_wing", posX: 10, posY: 20 };
  const anchor = { posX: 100, posY: 200, width: 300, height: 200 };
  const detached = detachCostumePlacement(anchor, old)!;
  assert.deepEqual(getCostumeCanvasPosition(null, detached), getCostumeCanvasPosition(anchor, old));
  assert.equal(detached.rotation, old.rotation);
  assert.equal(detached.flipX, true);
  assert.equal(detached.replacesWings, true);
  assert.equal(old.anchorPart, "left_wing");
  assert.equal(detachCostumePlacement(null, old), null);
});

test("changing the pivot keeps the artwork's canvas position stable", () => {
  for (const axis of ["pivotX", "pivotY"] as const) {
    const next = { ...fitting, ...changeCostumePivot(fitting, axis, 0) };
    assert.deepEqual(getCostumeCanvasPosition(null, next), getCostumeCanvasPosition(null, fitting));
  }
});

test("all animation choices survive schema validation and runtime normalization", () => {
  for (const animation of ADORNMENT_ANIMATIONS) {
    const saved = costumePlacementsSchema.parse([{ ...fitting, animation, animationSpeed: 0.5, replacesWings: true }]);
    const restored = normalizeCostumePlacements(JSON.parse(JSON.stringify(saved)))[0];
    assert.equal(restored.animation, animation);
    assert.equal(restored.animationSpeed, 0.5);
    assert.equal(restored.replacesWings, true);
    assert.equal(restored.anchorPart, "independent");
    assert.equal(adornmentMotion(animation, 1, false), undefined);
  }
  assert.equal(costumePlacementsSchema.safeParse([{ ...fitting, animation: "anything" }]).success, false);
  assert.equal(costumePlacementsSchema.safeParse([{ ...fitting, animationSpeed: -1 }]).success, false);
  assert.equal(normalizeCostumePlacements([{ ...fitting, animation: "bad", animationSpeed: Infinity }])[0].animation, "none");
});

test("mirrored wing artwork uses synchronized motion with a reflected partner and static mode stops it", async () => {
  const result = await build({ entryPoints: ["client/src/components/AdornmentArtwork.tsx"], bundle: true, platform: "node", format: "cjs", packages: "external", write: false, jsx: "automatic" });
  const module = { exports: {} as { default: any } };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const render = (animated: boolean) => renderToStaticMarkup(createElement(module.exports.default, { src: "/wing.png", placement: { ...fitting, animation: "wings" }, animated }));
  const moving = render(true);
  assert.equal((moving.match(/<img /g) ?? []).length, 2);
  assert.equal((moving.match(/adornment-wings 1.8s/g) ?? []).length, 2);
  assert.match(moving, /scaleX\(-1\)/);
  assert.equal((render(false).match(/animation:/g) ?? []).length, 0);
});
