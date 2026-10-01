import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_OBJECT_DRAG_THRESHOLD_PX,
  WORLD_OBJECT_MAX_PERCENT,
  WORLD_OBJECT_MIN_PERCENT,
  clampWorldObjectAdminPercent,
} from "../client/src/worlds/useWorldObjectAdminController";

const read = (path: string) => readFileSync(path, "utf8");

test("world object admin controller preserves existing drag constants", () => {
  assert.equal(WORLD_OBJECT_DRAG_THRESHOLD_PX, 3);
  assert.equal(WORLD_OBJECT_MIN_PERCENT, -10);
  assert.equal(WORLD_OBJECT_MAX_PERCENT, 110);
});

test("admin world objects remain clamped to the existing -10..110 percent range", () => {
  assert.equal(clampWorldObjectAdminPercent(-999), -10);
  assert.equal(clampWorldObjectAdminPercent(-10), -10);
  assert.equal(clampWorldObjectAdminPercent(0), 0);
  assert.equal(clampWorldObjectAdminPercent(50), 50);
  assert.equal(clampWorldObjectAdminPercent(100), 100);
  assert.equal(clampWorldObjectAdminPercent(110), 110);
  assert.equal(clampWorldObjectAdminPercent(999), 110);
});

test("controller preserves admin-only pointer capture and drag threshold behavior", () => {
  const source = read("client/src/worlds/useWorldObjectAdminController.ts");

  assert.match(source, /if \(!isAdmin\) return/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(
    source,
    /\(event\.target as HTMLElement\)\.setPointerCapture\(event\.pointerId\)/,
  );
  assert.match(source, /locationViewRef\.current\.getBoundingClientRect\(\)/);
  assert.match(
    source,
    /Math\.abs\(dx\) > WORLD_OBJECT_DRAG_THRESHOLD_PX/,
  );
  assert.match(
    source,
    /Math\.abs\(dy\) > WORLD_OBJECT_DRAG_THRESHOLD_PX/,
  );
  assert.match(source, /clampWorldObjectAdminPercent/);
});

test("controller commits the same rounded object position payload after a real drag", () => {
  const source = read("client/src/worlds/useWorldObjectAdminController.ts");

  assert.match(
    source,
    /if \(didDragRef\.current && dragPosition\) \{[\s\S]*?onCommitPosition\(\{[\s\S]*?objectId: drag\.objId,[\s\S]*?posX: Math\.round\(dragPosition\.x\),[\s\S]*?posY: Math\.round\(dragPosition\.y\)/,
  );
  assert.match(source, /const isObjectDragActive = useCallback\(\(\) => dragRef\.current !== null, \[\]\)/);
});

test("WorldPage delegates world object admin gestures to the shared controller", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(
    source,
    /import \{ useWorldObjectAdminController \} from "@\/worlds\/useWorldObjectAdminController"/,
  );
  assert.match(
    source,
    /useWorldObjectAdminController\(\{[\s\S]*?isAdmin: currentUser\.isAdmin,[\s\S]*?locationViewRef: locViewRef,[\s\S]*?onCommitPosition: objPositionMutation\.mutate/,
  );

  assert.doesNotMatch(source, /const \[objDragPos, setObjDragPos\]/);
  assert.doesNotMatch(source, /const objDragRef = useRef/);
  assert.doesNotMatch(source, /const objDidDrag = useRef/);
  assert.doesNotMatch(source, /const handleObjPointerDown = useCallback/);
  assert.doesNotMatch(source, /const handleObjPointerMove = useCallback/);
  assert.doesNotMatch(source, /const handleObjPointerUp = useCallback/);

  assert.match(source, /const isDragging = draggingObjectId === obj\.id/);
  assert.match(source, /objDragPos\?\.id === obj\.id/);
  assert.match(source, /if \(!objDidDrag\.current\) deleteObjectMutation\.mutate\(obj\.id\)/);
});

test("shared viewport still pauses map panning while an admin object drag is active", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");
  const viewport = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(
    worldPage,
    /useWorldViewportController\(\{[\s\S]*?isObjectDragActive/,
  );
  assert.match(
    viewport,
    /if \(isLocationDragActive\(\) \|\| isObjectDragActive\(\)\) return;/,
  );
});
