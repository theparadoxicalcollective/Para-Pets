import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
const wrapper = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
const canvas = readFileSync("client/src/components/PetAnimatorCanvas.tsx", "utf8");

test("ground pet legs stay planted during idle in the DOM renderer", () => {
  assert.match(core, /const isIdleLeg = \["left_leg", "right_leg", "front_leg", "back_leg"\]\.includes\(idlePartType\)/);
  assert.match(core, /mode === "idle" && !canFly && isIdleLeg/);
});

test("costume anchors follow the same flying-aware idle leg rule", () => {
  assert.match(wrapper, /function anchorAnimation\([\s\S]*?canFly: boolean\)/);
  assert.match(wrapper, /mode === "idle" && !canFly && \["left_leg", "right_leg", "front_leg", "back_leg"\]\.includes\(base\)/);
  assert.equal((wrapper.match(/anchorAnimation\((?:anchor|part), mode, resolvedView, idleStyle, canFly\)/g) ?? []).length, 2);
});

test("canvas pets only animate idle legs when the admin marks them flying", () => {
  assert.match(canvas, /function evalAnim\([\s\S]*?canFly = false\)/);
  assert.match(canvas, /case "left_leg":[\s\S]*?if \(!canFly\) return \{ op: 1, rot: 0 \}/);
  assert.match(canvas, /case "front_leg":[\s\S]*?return canFly \? bodyBreath\(sec\) : \{ op: 1, rot: 0 \}/);
  assert.match(canvas, /canFlyRef\.current = canFly/);
  assert.match(canvas, /idleStyleRef\.current \?\? undefined, canFlyRef\.current/);
});
