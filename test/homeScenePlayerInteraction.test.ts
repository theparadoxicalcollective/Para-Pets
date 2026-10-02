import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOME_SCENE_PLAYER_MAX_ABOVE_ADMIN,
  HOME_SCENE_PLAYER_MIN_SCALE,
  HOME_SCENE_PLAYER_SIZE_DECREASE_STEP,
  HOME_SCENE_PLAYER_SIZE_INCREASE_STEP,
  clampHomeScenePlayerSize,
} from "../shared/housing";

const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const asset = readFileSync("client/src/components/HomeSceneAssetImage.tsx", "utf8");
const routes = readFileSync("server/routes/homeDecor.routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");
const visitor = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");

test("player Home item size nudges are small and bounded around the Admin baseline", () => {
  assert.equal(HOME_SCENE_PLAYER_SIZE_DECREASE_STEP, 25);
  assert.equal(HOME_SCENE_PLAYER_SIZE_INCREASE_STEP, 10);
  assert.equal(HOME_SCENE_PLAYER_MIN_SCALE, 0.5);
  assert.equal(HOME_SCENE_PLAYER_MAX_ABOVE_ADMIN, 10);

  assert.equal(clampHomeScenePlayerSize(250, 100), 125);
  assert.equal(clampHomeScenePlayerSize(250, 250), 250);
  assert.equal(clampHomeScenePlayerSize(250, 999), 260);
  assert.equal(clampHomeScenePlayerSize(60, 1), 40);
  assert.equal(clampHomeScenePlayerSize(500, 999), 510);
});

test("Admin catalog size remains the starting size while player placement size persists afterward", () => {
  assert.match(storage, /item: \{ id: decor\.id,[\s\S]*homeSceneSize: decor\.homeSceneSize/);
  assert.match(storage, /item: \{ id: object\.id,[\s\S]*homeSceneSize: object\.homeSceneSize/);
  assert.doesNotMatch(storage, /size: decor\.homeSceneSize/);
  assert.doesNotMatch(storage, /size: object\.homeSceneSize/);
  assert.match(routes, /clampHomeScenePlayerSize\(placement\.item\.homeSceneSize, Number\(size\)\)/);
});

test("Decor and Objects no longer resize automatically from vertical position", () => {
  assert.match(owner, /const displaySize = item\.size/);
  assert.match(visitor, /const displaySize = item\.size/);
  assert.doesNotMatch(owner, /petHouseDepthSize\(item\.size, item\.yPct\)/);
  assert.doesNotMatch(visitor, /petHouseDepthSize\(item\.size, item\.yPct\)/);
});

test("players get minus and plus controls for both interior and outdoor Home items", () => {
  assert.equal((owner.match(/HOME_SCENE_PLAYER_SIZE_DECREASE_STEP/g) ?? []).length >= 3, true);
  assert.equal((owner.match(/HOME_SCENE_PLAYER_SIZE_INCREASE_STEP/g) ?? []).length >= 3, true);
  assert.equal((owner.match(/<Minus size=\{15\}/g) ?? []).length, 2);
  assert.equal((owner.match(/<Plus size=\{15\}/g) ?? []).length, 2);
  assert.equal((owner.match(/clampHomeScenePlayerSize\(item\.item\.homeSceneSize/g) ?? []).length, 4);
});

test("first press selects; only a selected item can begin dragging", () => {
  assert.match(owner, /if \(selectedItemId !== item\.id\) \{[\s\S]*setSelectedItemId\(item\.id\);[\s\S]*return;/);
  assert.match(owner, /if \(selectedPlacedId !== item\.id\) \{[\s\S]*setSelectedPlacedId\(item\.id\);[\s\S]*return;/);
  assert.match(owner, /setPointerCapture\(e\.pointerId\)/);
});

test("only visible artwork receives Home item pointer interaction", () => {
  assert.match(asset, /data-testid="home-scene-visible-hit-target"/);
  assert.match(asset, /pointerEvents: "none"/);
  assert.match(asset, /pointerEvents: "auto"/);
  assert.match(asset, /left: rect\.left/);
  assert.match(asset, /top: rect\.top/);
  assert.match(asset, /width: rect\.width/);
  assert.match(asset, /height: rect\.height/);
  assert.match(owner, /pointerEvents: "none"/);
  assert.equal((owner.match(/onPointerDown=\{\(e\) => onItemDown\(e, item\)\}/g) ?? []).length, 1);
  assert.equal((owner.match(/onPointerDown=\{\(e\) => handlePlacedDragStart\(e, item\)\}/g) ?? []).length, 1);
});
