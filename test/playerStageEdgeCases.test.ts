import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Pet Care jar physics uses logical stage pixels under portrait scaling", () => {
  const source = read("client/src/features/pet-care/FeedingOverlay.tsx");

  assert.match(source, /jarContentsRef\.current\?\.clientHeight \?\? 1/);
  assert.match(source, /width: boundsElement\.clientWidth \|\| 1/);
  assert.match(source, /height: boundsElement\.clientHeight \|\| 1/);
  assert.match(source, /clientPointInStageElement\(jar, event\.clientX, event\.clientY\)/);
  assert.match(source, /clientDeltaToStage\(/);
  assert.match(source, /localVelocity\.x \/ elapsed/);
  assert.match(source, /localVelocity\.y \/ elapsed/);
  assert.doesNotMatch(source, /\{ width: rect\.width, height: rect\.height \}/);
  assert.doesNotMatch(source, /event\.clientX - rect\.left,[\s\S]*?event\.clientY - rect\.top/);
});

test("Aquarium drag ghost renders in logical stage coordinates", () => {
  const source = read("client/src/pages/AquariumPage.tsx");

  assert.match(source, /import \{ clientToStage \} from "@\/lib\/stage"/);
  assert.match(source, /const ghostPoint = clientToStage\(dragging\.gx, dragging\.gy\)/);
  assert.match(source, /left: ghostPoint\.x - 27/);
  assert.match(source, /top: ghostPoint\.y - 27/);
  assert.doesNotMatch(source, /left: dragging\.gx - 27/);
  assert.doesNotMatch(source, /top: dragging\.gy - 27/);
});

test("Pet Home tutorial DOM targets convert from client pixels to stage-local coordinates", () => {
  const stage = read("client/src/lib/stage.ts");
  const overlay = read("client/src/components/PetHomeTutorialOverlay.tsx");

  assert.match(stage, /export function clientRectToStageRect/);
  assert.match(stage, /const left = \(rect\.left - surface\.left\) \/ scale/);
  assert.match(stage, /const top = \(rect\.top - surface\.top\) \/ scale/);
  assert.match(stage, /const width = rect\.width \/ scale/);
  assert.match(stage, /const height = rect\.height \/ scale/);
  assert.match(overlay, /return clientRectToStageRect\(element\.getBoundingClientRect\(\)\)/);
});
