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
  assert.match(component, /data-testid="home-scene-visible-hit-target"/);
});

test("visible selection preserves the original full-canvas artwork placement", () => {
  assert.match(component, /className="absolute inset-0 w-full h-full object-contain"/);
  assert.match(component, /transform: flipped \? "scaleX\(-1\)" : undefined/);
  assert.doesNotMatch(component, /drawImage\(/);
});

test("flipped items mirror the visible selection bounds too", () => {
  assert.match(component, /const left = flipped \? size - rawLeft - visibleWidth : rawLeft/);
});

test("both owner placement views use visible-only hit targets", () => {
  assert.equal((owner.match(/<HomeSceneAssetImage/g) ?? []).length, 2);
  assert.equal((owner.match(/selected=\{isSelected\}/g) ?? []).length, 2);
  assert.equal((owner.match(/onPointerDown=\{\(e\) => /g) ?? []).length >= 2, true);
  assert.match(component, /pointerEvents: "none"/);
  assert.match(component, /pointerEvents: "auto"/);
  assert.doesNotMatch(owner, /outline: isSelected \? "2px solid rgba\(255,215,0,0\.8\)"/);
});

test("selected Home items use a glowing gold outline and render above peers", () => {
  assert.match(component, /0 0 10px rgba\(255,215,0,0\.72\)/);
  assert.match(component, /0 0 20px rgba\(255,190,35,0\.38\)/);
  assert.match(owner, /zIndex: isSelected \? 110/);
  assert.match(owner, /setTopItemId\(item\.id\)/);
  assert.match(owner, /setTopOutdoorDecorId\(item\.id\)/);
});
