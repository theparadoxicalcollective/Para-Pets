import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");
const adminPage = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const indexHtml = readFileSync("client/index.html", "utf8");
const costumeSchema = readFileSync("shared/costumeSchema.ts", "utf8");
const bootMigrations = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");

test("pet editor exposes native Parts and Costume tabs without a CSS hiding workaround", () => {
  assert.match(editor, /type EditorTab = "parts" \| "costume"/);
  assert.match(editor, /\(\["parts", "costume"\] as const\)\.map/);
  assert.doesNotMatch(editor, /tab-pet-editor-animation/);
  assert.doesNotMatch(editor, /button-toggle-anim-preview/);
  assert.doesNotMatch(editor, /\bshowAnimPreview\b/);
  assert.doesNotMatch(editor, /<PetAnimatorCanvas/);
  assert.doesNotMatch(indexHtml, /adminPetEditor\.css/);
  assert.equal(existsSync("client/src/adminPetEditor.css"), false);
});

test("costume pointer movement only updates a local draft", () => {
  const pointerMove = editor.match(/const moveCostumeDrag = \(event:[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(editor, /onPointerMove=\{moveCostumeDrag\}/);
  assert.match(pointerMove, /updateCostumeDraft\(/);
  assert.doesNotMatch(pointerMove, /saveCostumeMutation\.mutate/);
  assert.match(editor, /setCostumeDraft\(current =>/);
  assert.match(editor, /setCostumeDraftDirty\(true\)/);
  assert.doesNotMatch(editor, /\bupdateCostume\(/);
});

test("costume placement persists only from the explicit Save action", () => {
  assert.match(editor, /const saveCostumePlacement = \(\) => \{/);
  assert.match(editor, /saveCostumeMutation\.mutate\(\{ itemId: selectedCostumeId, placement: \{ \.\.\.selectedCostumePlacement, rotation:/);
  assert.match(editor, /queryClient\.setQueryData<CostumeDefinition\[]>/);
  assert.match(editor, /data-testid="costume-save-dock"/);
  assert.match(editor, /fixed left-4 right-4/);
  assert.match(editor, /data-testid="button-save-costume-placement"/);
  assert.match(editor, /onClick=\{saveCostumePlacement\}/);
});

test("costume editor provides proportional sizing and offset-preserving direct drag", () => {
  const pointerStart = editor.match(/const startCostumeDrag = \(event:[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(editor, /data-testid="input-costume-size"/);
  assert.doesNotMatch(editor, /input-costume-width|input-costume-height/);
  assert.match(editor, /const resizeCostume = \(nextSize: number\) =>/);
  assert.match(editor, /resizeCostumePlacement\(selectedCostumePlacement, nextSize\)/);
  assert.match(pointerStart, /getCostumeDragOffset\(/);
  assert.match(pointerStart, /setPointerCapture\(event\.pointerId\)/);
  assert.match(editor, /onPointerCancel=\{\(event\) => endCostumeDrag\(event\.pointerId\)\}/);
  assert.match(editor, /onLostPointerCapture=\{\(event\) => endCostumeDrag\(event\.pointerId\)\}/);
  assert.match(editor, /draggable=\{false\}/);
});

test("dirty costume drafts are protected when switching items, tabs, or closing the overlay", () => {
  assert.match(editor, /Discard the unsaved costume placement\?/);
  assert.match(editor, /const selectCostume = \(itemId: string\) => \{/);
  assert.match(editor, /const changeEditorTab = \(tab: EditorTab\) => \{/);
  assert.match(editor, /const changeCostumeView = \(mode: "front" \| "side"\) => \{/);
  assert.match(editor, /data-testid="button-costume-view-front"/);
  assert.match(editor, /data-testid="button-costume-view-side"/);
  assert.match(editor, /window\.addEventListener\("beforeunload", warnBeforeUnload\)/);
  assert.match(editor, /onCostumeDirtyChange\?\.\(costumeDraftDirty\)/);
  assert.match(adminPage, /if \(partsOverlayDirty && !window\.confirm\("Discard the unsaved costume placement\?"\)\) return/);
  assert.match(adminPage, /onClick=\{closePartsOverlay\}/);
  assert.match(adminPage, /onCostumeDirtyChange=\{setPartsOverlayDirty\}/);
});

test("costume controls cannot change the draft while a save is pending", () => {
  assert.match(editor, /if \(!selectedCostumeId \|\| saveCostumeMutation\.isPending\) return/);
  assert.match(editor, /disabled=\{saveCostumeMutation\.isPending\}/);
  assert.match(editor, /if \(saveCostumeMutation\.isPending \|\| itemId === selectedCostumeId\) return/);
  assert.match(editor, /if \(saveCostumeMutation\.isPending \|\| tab === editorTab\) return/);
});

test("costume editor supports persisted rotation around the saved pivot", () => {
  assert.match(editor, /data-testid="input-costume-rotation"/);
  assert.match(editor, /const rotateCostume = \(degrees: number\)/);
  assert.match(editor, /transform: `rotate\(\$\{selectedCostumePlacement\.rotation \?\? 0\}deg\) scaleX\(\$\{selectedCostumePlacement\.flipX \? -1 : 1\}\)`/);
  assert.match(editor, /transformOrigin: `\$\{selectedCostumePlacement\.pivotX\}% \$\{selectedCostumePlacement\.pivotY\}%`/);
  assert.match(costumeSchema, /rotation: z\.number\(\)\.min\(-180\)\.max\(180\)\.default\(0\)/);
});

test("costume editor supports a persisted horizontal flip", () => {
  assert.match(editor, /data-testid="button-flip-costume-horizontal"/);
  assert.match(editor, /const flipCostume = \(\) =>/);
  assert.match(editor, /flipX: false/);
  assert.match(editor, /flipX: selectedCostumePlacement\.flipX \?\? false/);
  assert.match(costumeSchema, /flipX: z\.boolean\(\)\.default\(false\)/);
});

test("admin pet editing respects mobile safe areas and authored part stacking", () => {
  assert.match(editor, /safe-area-inset-top/);
  assert.match(editor, /const previewEffectiveZ = \(p: \{ zIndex: number \}\): number => p\.zIndex/);
  assert.match(editor, /basePetPartType\(part\.partType\) === "above_head" \? 20000/);
});

test("costume vault scales through search and a compact thumbnail grid", () => {
  assert.match(editor, /data-testid="input-costume-search"/);
  assert.match(editor, /filteredCostumeItems/);
  assert.match(editor, /grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-2/);
  assert.match(editor, /COSTUME VAULT/);
});

test("production boot creates the costume definition table used by the save route", () => {
  assert.match(bootMigrations, /CREATE TABLE IF NOT EXISTS pet_costume_definitions/);
  assert.match(bootMigrations, /CREATE UNIQUE INDEX IF NOT EXISTS pet_costume_definitions_item_template_uidx/);
});

