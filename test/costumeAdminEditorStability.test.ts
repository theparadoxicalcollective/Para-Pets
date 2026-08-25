import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");
const adminPage = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const indexHtml = readFileSync("client/index.html", "utf8");

test("pet editor exposes native Parts and Costume tabs without a CSS hiding workaround", () => {
  assert.match(editor, /type EditorTab = "parts" \| "costume"/);
  assert.match(editor, /\(\["parts", "costume"\] as const\)\.map/);
  assert.doesNotMatch(editor, /tab-pet-editor-animation/);
  assert.doesNotMatch(indexHtml, /adminPetEditor\.css/);
  assert.equal(existsSync("client/src/adminPetEditor.css"), false);
});

test("costume pointer movement only updates a local draft", () => {
  const costumeCanvas = editor.match(/data-testid="costume-placement-canvas"[\s\S]*?\n          <\/div>/)?.[0] ?? "";
  const pointerMove = costumeCanvas.match(/onPointerMove=\{\(event\) => \{[\s\S]*?\n            \}\}/)?.[0] ?? "";
  assert.match(pointerMove, /updateCostumeDraft\(/);
  assert.doesNotMatch(pointerMove, /saveCostumeMutation\.mutate/);
  assert.match(editor, /setCostumeDraft\(current =>/);
  assert.match(editor, /setCostumeDraftDirty\(true\)/);
  assert.doesNotMatch(editor, /\bupdateCostume\(/);
});

test("costume placement persists only from the explicit Save action", () => {
  assert.match(editor, /const saveCostumePlacement = \(\) => \{/);
  assert.match(editor, /saveCostumeMutation\.mutate\(\{ itemId: selectedCostumeId, placement: selectedCostumePlacement \}\)/);
  assert.match(editor, /data-testid="button-save-costume-placement"/);
  assert.match(editor, /onClick=\{saveCostumePlacement\}/);
});

test("costume editor restores template-space resize controls and safe drag cleanup", () => {
  assert.match(editor, /data-testid="input-costume-width"/);
  assert.match(editor, /data-testid="input-costume-height"/);
  assert.match(editor, /updateCostumeDraft\(\{ width: Number\(event\.target\.value\) \}\)/);
  assert.match(editor, /updateCostumeDraft\(\{ height: Number\(event\.target\.value\) \}\)/);
  assert.match(editor, /onPointerCancel=\{\(\) => setDraggingCostume\(false\)\}/);
  assert.match(editor, /onLostPointerCapture=\{\(\) => setDraggingCostume\(false\)\}/);
});

test("dirty costume drafts are protected when switching items, tabs, or closing the overlay", () => {
  assert.match(editor, /Discard the unsaved costume placement\?/);
  assert.match(editor, /const selectCostume = \(itemId: string\) => \{/);
  assert.match(editor, /const changeEditorTab = \(tab: EditorTab\) => \{/);
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
