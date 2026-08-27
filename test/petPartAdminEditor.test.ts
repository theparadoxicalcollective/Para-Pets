import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  clampPetPartRotation,
  getDraggedPetPartPosition,
  getPetPartDragOffset,
  getUnrotatedPetPartPoint,
  resizePetPartTransform,
} from "../client/src/lib/petPartPlacement";

test("pet part placement helpers preserve aspect ratio and pointer offset", () => {
  const part = { posX: 100, posY: 200, width: 400, height: 200, pivotX: 50, pivotY: 50, rotation: 0 };
  assert.deepEqual(resizePetPartTransform(part, 200), { ...part, width: 200, height: 100 });
  const offset = getPetPartDragOffset({ x: 175, y: 250 }, part);
  assert.deepEqual(offset, { x: 75, y: 50 });
  assert.deepEqual(getDraggedPetPartPosition({ x: 300, y: 350 }, offset), { posX: 225, posY: 300 });
});

test("rotated pet part hit testing maps the pointer back into artwork space", () => {
  const part = { posX: 100, posY: 100, width: 200, height: 100, pivotX: 50, pivotY: 50, rotation: 90 };
  const point = getUnrotatedPetPartPoint({ x: 200, y: 200 }, part);
  assert.ok(Math.abs(point.x - 250) < 0.001);
  assert.ok(Math.abs(point.y - 150) < 0.001);
  assert.equal(clampPetPartRotation(999), 180);
  assert.equal(clampPetPartRotation(-999), -180);
});

test("admin Parts and Evolution editors expose direct drag, proportional size, and rotation controls", () => {
  const editor = fs.readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");
  assert.match(editor, /data-testid="selected-part-transform-panel"/);
  assert.match(editor, /onPointerDown=\{isSelected \? \(event\) => startPartDrag\(event, part\)/);
  assert.match(editor, /onPointerMove=\{movePartDrag\}/);
  assert.match(editor, /data-testid="input-part-size"/);
  assert.match(editor, /resizePetPartTransform/);
  assert.match(editor, /data-testid="input-part-rotation"/);
  assert.match(editor, /rotation: clampPetPartRotation/);
  assert.match(editor, /Layer order unchanged · z/);
  assert.match(editor, /data-testid="pet-part-center-guide-horizontal"/);
  assert.match(editor, /data-testid="pet-part-center-guide-vertical"/);
  assert.match(editor, /const previewEffectiveZ = \(p: \{ zIndex: number \}\): number => p\.zIndex/);
});

test("authored rotation persists and is composed by every pet renderer", () => {
  const schema = fs.readFileSync("shared/schema.ts", "utf8");
  const boot = fs.readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const core = fs.readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
  const canvas = fs.readFileSync("client/src/components/PetAnimatorCanvas.tsx", "utf8");
  const gif = fs.readFileSync("client/src/lib/petGif.ts", "utf8");

  assert.match(schema, /rotation: integer\("rotation"\)\.notNull\(\)\.default\(0\)/);
  assert.match(boot, /ADD COLUMN IF NOT EXISTS rotation INTEGER NOT NULL DEFAULT 0/);
  assert.match(routes, /updates\.rotation = Math\.max\(-180, Math\.min\(180, Math\.round\(rotation\)\)\)/);
  assert.match(routes, /transform="rotate\(\$\{rotation\} \$\{pivotX\} \$\{pivotY\}\)"/);
  assert.match(core, /rotate: `\$\{part\.rotation \?\? 0\}deg`/);
  assert.match(canvas, /authoredRot \+ rot \+ headNodRot/);
  assert.match(gif, /\(part\.rotation \?\? 0\) \+ xform\.rotate/);
});
