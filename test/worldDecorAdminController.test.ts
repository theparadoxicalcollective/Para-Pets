import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_DECOR_DRAG_THRESHOLD_PX,
  WORLD_DECOR_MAX_PERCENT,
  WORLD_DECOR_MIN_PERCENT,
  clampWorldDecorAdminPercent,
} from "../client/src/worlds/useWorldDecorAdminController";

const read = (path: string) => readFileSync(path, "utf8");

test("world decor admin controller preserves existing drag constants", () => {
  assert.equal(WORLD_DECOR_DRAG_THRESHOLD_PX, 3);
  assert.equal(WORLD_DECOR_MIN_PERCENT, 0);
  assert.equal(WORLD_DECOR_MAX_PERCENT, 100);
});

test("admin world decor remains clamped to the existing 0..100 percent range", () => {
  assert.equal(clampWorldDecorAdminPercent(-999), 0);
  assert.equal(clampWorldDecorAdminPercent(0), 0);
  assert.equal(clampWorldDecorAdminPercent(50), 50);
  assert.equal(clampWorldDecorAdminPercent(100), 100);
  assert.equal(clampWorldDecorAdminPercent(999), 100);
});

test("decor placement dragging preserves pointer capture and the 3px threshold", () => {
  const source = read("client/src/worlds/useWorldDecorAdminController.ts");

  assert.match(source, /if \(!isAdmin\) return/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(
    source,
    /\(event\.target as HTMLElement\)\.setPointerCapture\(event\.pointerId\)/,
  );
  assert.match(
    source,
    /Math\.abs\(dx\) > WORLD_DECOR_DRAG_THRESHOLD_PX/,
  );
  assert.match(
    source,
    /Math\.abs\(dy\) > WORLD_DECOR_DRAG_THRESHOLD_PX/,
  );
  assert.match(source, /clampWorldDecorAdminPercent/);
});

test("decor drag commits the same unrounded placement coordinates and tap toggles selection", () => {
  const source = read("client/src/worlds/useWorldDecorAdminController.ts");

  assert.match(
    source,
    /onCommitPlacement\(\{[\s\S]*?id: drag\.placementId,[\s\S]*?posX: dragPosition\.x,[\s\S]*?posY: dragPosition\.y/,
  );
  assert.doesNotMatch(
    source,
    /posX: Math\.round\(dragPosition\.x\)|posY: Math\.round\(dragPosition\.y\)/,
  );
  assert.match(
    source,
    /setSelectedPlacementId\(previous =>[\s\S]*?previous === drag\.placementId \? null : drag\.placementId/,
  );
});

test("decor panel drag still creates a placement only when released inside the authored world", () => {
  const source = read("client/src/worlds/useWorldDecorAdminController.ts");

  assert.match(source, /document\.addEventListener\("pointermove", onMove\)/);
  assert.match(source, /document\.addEventListener\("pointerup", onUp\)/);
  assert.match(
    source,
    /event\.clientX >= rect\.left[\s\S]*?event\.clientX <= rect\.right[\s\S]*?event\.clientY >= rect\.top[\s\S]*?event\.clientY <= rect\.bottom/,
  );
  assert.match(
    source,
    /posX: \(\(event\.clientX - rect\.left\) \/ rect\.width\) \* 100/,
  );
  assert.match(
    source,
    /posY: \(\(event\.clientY - rect\.top\) \/ rect\.height\) \* 100/,
  );
});

test("WorldPage delegates decor admin gesture state to the shared controller", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(
    source,
    /import \{ useWorldDecorAdminController \} from "@\/worlds\/useWorldDecorAdminController"/,
  );
  assert.match(
    source,
    /useWorldDecorAdminController\(\{[\s\S]*?isAdmin: currentUser\.isAdmin,[\s\S]*?areaRef,[\s\S]*?onCommitPlacement: updateDecorPlacementMutation\.mutate,[\s\S]*?onCreatePlacement: addDecorPlacementMutation\.mutate/,
  );

  assert.doesNotMatch(source, /const decorDragRef = useRef/);
  assert.doesNotMatch(source, /const decorDidDrag = useRef/);
  assert.doesNotMatch(source, /const panelDragRef = useRef/);
  assert.doesNotMatch(source, /const \[decorDragPos, setDecorDragPos\]/);
  assert.doesNotMatch(source, /const \[panelDragGhost, setPanelDragGhost\]/);
  assert.doesNotMatch(source, /const handleDecorPointerDown = useCallback/);

  assert.match(source, /onPointerCancel=\{cancelDecorPlacementDrag\}/);
  assert.match(source, /startDecorPanelDrag\(e, \{ id: item\.id, name: item\.name, imageUrl: item\.imageUrl \}\)/);
  assert.match(source, /selectedDecorId === p\.id/);
});
