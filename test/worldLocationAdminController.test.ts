import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_LOCATION_ADMIN_SECOND_TAP_MS,
  WORLD_LOCATION_DRAG_RESET_MS,
  WORLD_LOCATION_DRAG_THRESHOLD_PX,
  WORLD_LOCATION_MAX_PERCENT,
  WORLD_LOCATION_MIN_PERCENT,
  WORLD_LOCATION_POST_DRAG_CLICK_MS,
  clampWorldLocationAdminPercent,
  shouldSuppressWorldLocationClick,
} from "../client/src/worlds/useWorldLocationAdminController";

test("world location admin controller preserves existing drag and tap constants", () => {
  assert.equal(WORLD_LOCATION_DRAG_THRESHOLD_PX, 3);
  assert.equal(WORLD_LOCATION_MIN_PERCENT, -10);
  assert.equal(WORLD_LOCATION_MAX_PERCENT, 110);
  assert.equal(WORLD_LOCATION_POST_DRAG_CLICK_MS, 350);
  assert.equal(WORLD_LOCATION_ADMIN_SECOND_TAP_MS, 400);
  assert.equal(WORLD_LOCATION_DRAG_RESET_MS, 300);
});

test("admin location placement remains clamped to the existing -10..110 percent range", () => {
  assert.equal(clampWorldLocationAdminPercent(-999), -10);
  assert.equal(clampWorldLocationAdminPercent(-10), -10);
  assert.equal(clampWorldLocationAdminPercent(0), 0);
  assert.equal(clampWorldLocationAdminPercent(50), 50);
  assert.equal(clampWorldLocationAdminPercent(100), 100);
  assert.equal(clampWorldLocationAdminPercent(110), 110);
  assert.equal(clampWorldLocationAdminPercent(999), 110);
});

test("post-drag click suppression preserves the existing 350ms boundary", () => {
  assert.equal(shouldSuppressWorldLocationClick(true, 0, 10_000), true);
  assert.equal(shouldSuppressWorldLocationClick(false, 1_000, 1_349), true);
  assert.equal(shouldSuppressWorldLocationClick(false, 1_000, 1_350), false);
  assert.equal(shouldSuppressWorldLocationClick(false, 1_000, 2_000), false);
});

test("controller preserves selected-first drag and pointer-capture behavior", () => {
  const source = readFileSync(
    "client/src/worlds/useWorldLocationAdminController.ts",
    "utf8",
  );

  assert.match(source, /if \(!isAdmin\) return/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(
    source,
    /if \(selectedLocationRef\.current !== location\.id\) return/,
  );
  assert.match(
    source,
    /\(event\.target as HTMLElement\)\.setPointerCapture\(event\.pointerId\)/,
  );
  assert.match(
    source,
    /Math\.abs\(dx\) > WORLD_LOCATION_DRAG_THRESHOLD_PX/,
  );
  assert.match(
    source,
    /Math\.abs\(dy\) > WORLD_LOCATION_DRAG_THRESHOLD_PX/,
  );
  assert.match(source, /clampWorldLocationAdminPercent/);
});

test("controller commits the same location position payload after a real drag", () => {
  const source = readFileSync(
    "client/src/worlds/useWorldLocationAdminController.ts",
    "utf8",
  );

  assert.match(
    source,
    /onCommitPosition\(\{[\s\S]*?locationId: drag\.locId,[\s\S]*?posX: dragPosition\.x,[\s\S]*?posY: dragPosition\.y/,
  );
  assert.match(
    source,
    /lastDragEndTimeRef\.current = Date\.now\(\)/,
  );
  assert.match(
    source,
    /WORLD_LOCATION_DRAG_RESET_MS/,
  );
});

test("admin second tap still opens the selected location inside the 400ms selection window", () => {
  const source = readFileSync(
    "client/src/worlds/useWorldLocationAdminController.ts",
    "utf8",
  );

  assert.match(
    source,
    /if \(adminTapRef\.current\?\.id === locationId\)/,
  );
  assert.match(source, /setSelectedLocationId\(null\)/);
  assert.match(source, /onOpen\(\)/);
  assert.match(
    source,
    /WORLD_LOCATION_ADMIN_SECOND_TAP_MS/,
  );
});

test("WorldPage delegates location admin gesture state to the controller", () => {
  const source = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

  assert.match(
    source,
    /import \{ useWorldLocationAdminController \} from "@\/worlds\/useWorldLocationAdminController"/,
  );
  assert.match(
    source,
    /useWorldLocationAdminController\(\{[\s\S]*?isAdmin: currentUser\.isAdmin,[\s\S]*?areaRef,[\s\S]*?onCommitPosition: positionMutation\.mutate/,
  );

  assert.doesNotMatch(source, /const \[selectedLocId, setSelectedLocId\]/);
  assert.doesNotMatch(source, /const draggableLocIdRef =/);
  assert.doesNotMatch(source, /const dragRef = useRef<\{ locId:/);
  assert.doesNotMatch(source, /const adminLocTapRef =/);
  assert.doesNotMatch(source, /const lastDragEndTimeRef =/);

  assert.match(source, /selectedLocationId=\{selectedLocId\}/);
  assert.match(source, /draggingLocationId=\{draggingLocationId\}/);
  assert.match(source, /dragPosition=\{dragPos\}/);
  assert.match(source, /onPointerDown=\{handlePointerDown\}/);
});

test("map panning remains mutually exclusive with location dragging", () => {
  const controller = readFileSync(
    "client/src/worlds/useWorldViewportController.ts",
    "utf8",
  );
  const worldPage = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

  assert.match(
    controller,
    /if \(isLocationDragActive\(\) && !mapPanPointersRef\.current\.size\) \{[\s\S]*?clearStaleLocationDrag\(\)/,
  );
  assert.match(
    controller,
    /if \(isLocationDragActive\(\) \|\| isObjectDragActive\(\)\) return/,
  );
  assert.match(worldPage, /onPointerCancel=\{cancelLocationDrag\}/);
});

test("decor and background selection clear location selection through one controller action", () => {
  const source = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

  assert.doesNotMatch(source, /setSelectedLocId/);
  assert.match(
    source,
    /handleDecorPointerDown\(e, p\); clearLocationSelection\(\)/,
  );
  assert.match(
    source,
    /if \(currentUser\.isAdmin\) \{[\s\S]*?clearLocationSelection\(\);[\s\S]*?setSelectedDecorId\(null\);/,
  );
  assert.doesNotMatch(source, /setBarrelSelected/);
});
