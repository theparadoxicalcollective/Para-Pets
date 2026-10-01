import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_FISH_BARREL_DRAG_THRESHOLD_PX,
  WORLD_FISH_BARREL_MAX_PERCENT,
  WORLD_FISH_BARREL_MIN_PERCENT,
  clampWorldFishBarrelAdminPercent,
} from "../client/src/worlds/useWorldFishBarrelAdminController";

const read = (path: string) => readFileSync(path, "utf8");

test("fish barrel admin controller preserves existing drag constants", () => {
  assert.equal(WORLD_FISH_BARREL_DRAG_THRESHOLD_PX, 3);
  assert.equal(WORLD_FISH_BARREL_MIN_PERCENT, 0);
  assert.equal(WORLD_FISH_BARREL_MAX_PERCENT, 100);
});

test("admin fish barrel remains clamped to the existing 0..100 percent range", () => {
  assert.equal(clampWorldFishBarrelAdminPercent(-999), 0);
  assert.equal(clampWorldFishBarrelAdminPercent(0), 0);
  assert.equal(clampWorldFishBarrelAdminPercent(50), 50);
  assert.equal(clampWorldFishBarrelAdminPercent(100), 100);
  assert.equal(clampWorldFishBarrelAdminPercent(999), 100);
});

test("fish barrel dragging preserves pointer capture and the 3px threshold", () => {
  const source = read("client/src/worlds/useWorldFishBarrelAdminController.ts");

  assert.match(source, /if \(!isAdmin \|\| !barrel\) return/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(
    source,
    /\(event\.currentTarget as HTMLElement\)\.setPointerCapture\(event\.pointerId\)/,
  );
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(
    source,
    /Math\.abs\(dx\) > WORLD_FISH_BARREL_DRAG_THRESHOLD_PX/,
  );
  assert.match(
    source,
    /Math\.abs\(dy\) > WORLD_FISH_BARREL_DRAG_THRESHOLD_PX/,
  );
  assert.match(source, /clampWorldFishBarrelAdminPercent/);
});

test("fish barrel drag commits the same unrounded coordinates and clears transient drag state", () => {
  const source = read("client/src/worlds/useWorldFishBarrelAdminController.ts");

  assert.match(
    source,
    /onCommitPosition\(\{[\s\S]*?posX: dragPosition\.x,[\s\S]*?posY: dragPosition\.y/,
  );
  assert.doesNotMatch(
    source,
    /posX: Math\.round\(dragPosition\.x\)|posY: Math\.round\(dragPosition\.y\)/,
  );
  assert.match(
    source,
    /didDragRef\.current = false;[\s\S]*?setDragPosition\(null\)/,
  );
});

test("WorldPage delegates fish barrel admin gesture state to the shared controller", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(
    source,
    /import \{ useWorldFishBarrelAdminController \} from "@\/worlds\/useWorldFishBarrelAdminController"/,
  );
  assert.match(
    source,
    /useWorldFishBarrelAdminController\(\{[\s\S]*?isAdmin: currentUser\.isAdmin,[\s\S]*?barrel: fishBarrel,[\s\S]*?areaRef,[\s\S]*?onCommitPosition: updateBarrelMutation\.mutate/,
  );

  assert.doesNotMatch(source, /const barrelDragRef = useRef/);
  assert.doesNotMatch(source, /const barrelDidDrag = useRef/);
  assert.doesNotMatch(source, /const \[barrelDragPos, setBarrelDragPos\]/);
  assert.doesNotMatch(source, /const handleBarrelPointerDown = useCallback/);
  assert.doesNotMatch(source, /const handleBarrelPointerMove = useCallback/);
  assert.doesNotMatch(source, /const handleBarrelPointerUp = useCallback/);

  assert.match(source, /onPointerCancel=\{cancelBarrelDrag\}/);
  assert.match(source, /if \(barrelDidDrag\.current\) return/);
  assert.match(source, /setBarrelSelected\(prev => !prev\)/);
  assert.match(source, /setShowSellFish\(true\)/);
});

test("barrel position remains shared by the rendered barrel and Sell Fish quest hint", () => {
  const source = read("client/src/pages/WorldPage.tsx");
  const occurrences = source.match(
    /const bpos = barrelDragPos \? barrelDragPos : \{ x: fishBarrel\.posX, y: fishBarrel\.posY \};/g,
  ) ?? [];

  assert.equal(occurrences.length, 2);
  assert.match(source, /data-testid="button-fish-barrel"/);
  assert.match(source, /Sell Fish Here/);
});
