import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");

test("costume wrapper measures logical stage dimensions instead of transformed bounds", () => {
  assert.match(animator, /Math\.min\(node\.clientWidth, node\.clientHeight\)/);

  const measurementBlock = animator.match(/const measure = \(\) => \{[\s\S]*?\n    \};/);
  assert.ok(measurementBlock, "expected PetAnimator measurement block");
  const executableMeasurement = measurementBlock[0]
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(executableMeasurement, /\.getBoundingClientRect\s*\(/);
});

test("costume layers remain in the shared 1000x1000 template coordinate system", () => {
  assert.match(animator, /const CANVAS_SIZE = 1000/);
  assert.match(animator, /getCostumeCanvasPosition\(anchor, placement\)/);
  assert.match(animator, /\(anchor\.posX \/ CANVAS_SIZE\) \* 100/);
  assert.match(animator, /\(anchor\.posY \/ CANVAS_SIZE\) \* 100/);
});
