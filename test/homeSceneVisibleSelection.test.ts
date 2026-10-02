import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("client/src/components/HomeSceneAssetImage.tsx", "utf8");
const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

test("Home item selection uses visible non-transparent artwork bounds", () => {
  assert.match(component, /getVisibleImageAnalysis/);
  assert.match(component, /analysis\.bounds\.left \* scale/);
  assert.match(component, /analysis\.bounds\.top \* scale/);
  assert.match(component, /analysis\.bounds\.width \* scale/);
  assert.match(component, /analysis\.bounds\.height \* scale/);
  assert.match(component, /data-testid="home-scene-visible-selection"/);
});

test("visible selection preserves the original full-canvas artwork placement", () => {
  assert.match(component, /className="absolute inset-0 w-full h-full object-contain"/);
  assert.match(component, /transform: flipped \? "scaleX\(-1\)" : undefined/);
  assert.doesNotMatch(component, /drawImage\(/);
});

test("flipped items mirror the visible selection bounds too", () => {
  assert.match(component, /const left = flipped \? size - rawLeft - visibleWidth : rawLeft/);
});

test("both interior and outdoor owner placement views use visible selection", () => {
  assert.equal((owner.match(/<HomeSceneAssetImage/g) ?? []).length, 2);
  assert.equal((owner.match(/selected=\{isSelected\}/g) ?? []).length, 2);
  assert.doesNotMatch(owner, /outline: isSelected \? "2px solid rgba\(255,215,0,0\.8\)"/);
});
