import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("iOS swipe navigation guard does not cancel explicitly owned gameplay gestures", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(app, /touchStartedInGameplayGesture = target\?\.closest\?\.\('\[data-gameplay-touch-gesture="true"\]'\) != null/);
  assert.match(app, /touchStartedInPetCareShelf \|\| touchStartedInIosEdgeControl \|\| touchStartedInGameplayGesture/);
  assert.match(app, /if \(adx > 10 && \(adx > ady \* 1\.2 \|\| fromEdge\)\) \{/);
});

test("Pet Care explicitly owns petting and jar drag pointer streams", () => {
  const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(care, /data-gameplay-touch-gesture="true"[\s\S]{0,100}onPointerDown=\{onPetPointerDown\}/);
  assert.match(care, /data-gameplay-touch-gesture="true"[\s\S]{0,100}onPointerDown=\{dragEnabled \? \(event\) => beginJarMove/);
  assert.match(care, /touchAction: "none"/);
});
