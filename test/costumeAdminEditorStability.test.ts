import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { costumePlacementsSchema } from "../shared/costumeSchema";

const editor = readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");
const adminPage = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const indexHtml = readFileSync("client/index.html", "utf8");
const costumeSchema = readFileSync("shared/costumeSchema.ts", "utf8");
const bootMigrations = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
const schema = readFileSync("shared/schema.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

test("pet editor exposes native Parts, Evolution, and Costume tabs without a CSS hiding workaround", () => {
  assert.match(editor, /type EditorTab = "parts" \| "evolution" \| "costume"/);
  assert.match(editor, /\(\["parts", "evolution", "costume"\] as const\)\.map/);
  assert.doesNotMatch(editor, /tab-pet-editor-animation/);
  assert.doesNotMatch(editor, /button-toggle-anim-preview/);
  assert.doesNotMatch(editor, /\bshowAnimPreview\b/);
  assert.doesNotMatch(editor, /<PetAnimatorCanvas/);
  assert.doesNotMatch(indexHtml, /adminPetEditor\.css/);
  assert.equal(existsSync("client/src/adminPetEditor.css"), false);
});

test("evolution artwork is authored in a separate, non-runtime pet part form", () => {
  assert.match(editor, /data-testid=\{editorTab === "evolution" \? "pet-evolution-editor" : "pet-parts-editor"\}/);
  assert.match(editor, /const activeParts = editorTab === "evolution"/);
  assert.match(editor, /form: editorTab === "evolution" \? "evolution" : "base"/);
  assert.match(editor, /will not activate until the full evolution process is added/);
  assert.match(schema, /form: text\("form"\)\.notNull\(\)\.default\("base"\)/);
  assert.match(storage, /getPetTemplateParts\(templateId: string, form: "base" \| "evolution" = "base"\)/);
  assert.match(routes, /storage\.getPetTemplateParts\(templateId, "evolution"\)/);
  assert.match(routes, /form must be base or evolution/);
  assert.match(bootMigrations, /ALTER TABLE pet_template_parts ADD COLUMN IF NOT EXISTS form TEXT NOT NULL DEFAULT 'base'/);
  assert.doesNotMatch(editor, /editorTab === "evolution"[\s\S]{0,120}assembleMutation\.mutate/);
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
  assert.match(editor, /saveCostumeMutation\.mutate\(\{ itemId: selectedCostumeId, placement: \{ \.\.\.selectedCostumePlacement, instance: selectedCostumeInstance, rotation:/);
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
  assert.match(editor, /onLostPointerCapture=\{isActive \? \(event\) => endCostumeDrag\(event\.pointerId\) : undefined\}/);
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
  assert.match(editor, /transform: `rotate\(\$\{placement\.rotation \?\? 0\}deg\) scaleX\(\$\{placement\.flipX \? -1 : 1\}\)`/);
  assert.match(editor, /transformOrigin: `\$\{placement\.pivotX\}% \$\{placement\.pivotY\}%`/);
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
  assert.match(adminPage, /paddingTop: "max\(20px, calc\(env\(safe-area-inset-top\) \+ 14px\)\)"/);
  assert.match(editor, /const previewEffectiveZ = \(p: \{ zIndex: number \}\): number => p\.zIndex/);
  assert.match(editor, /basePetPartType\(part\.partType\) === "above_head" \? 20000/);
});

test("admin can fit one costume artwork as an original plus at most three duplicates", () => {
  assert.match(editor, /COSTUME_MAX_PLACEMENT_INSTANCES/);
  assert.match(editor, /data-testid="button-duplicate-costume-piece"/);
  assert.match(editor, /data-testid="costume-copy-selector"/);
  assert.match(editor, /`COPY \${instance - 1}`/);
  assert.match(editor, /instance: selectedCostumeInstance/);
  assert.match(editor, /current\.view !== placement\.view \|\| \(current\.instance \?\? 1\) !== placementInstance/);
  assert.match(editor, /Original \+ up to 3 duplicates per pet/);
  assert.match(editor, /data-testid="button-remove-costume-copy"/);
  assert.match(costumeSchema, /instance: z\.number\(\)\.int\(\)\.min\(1\)\.max\(COSTUME_MAX_PLACEMENT_INSTANCES\)\.default\(1\)/);
});

test("costume anchor selector lists every uploaded pet layer and marks opposite-view layers unavailable", () => {
  assert.match(editor, /uploadedPartTypes = Array\.from\(new Set\(\(templateDetail\?\.parts \?\? \[\]\)\.map/);
  assert.match(editor, /availableInCurrentView: currentViewPartTypes\.has\(partType\)/);
  assert.match(editor, /disabled=\{!part\.availableInCurrentView\}/);
  assert.match(editor, /part\.views\.map/);
});

test("server accepts three duplicates, rejects a fourth, and preserves flip defaults", () => {
  const placement = {
    view: "front" as const,
    anchorPart: "body",
    posX: 10,
    posY: 20,
    width: 100,
    height: 100,
    pivotX: 50,
    pivotY: 50,
    rotation: 0,
    depth: "front" as const,
  };
  const allowed = costumePlacementsSchema.safeParse([
    { ...placement, instance: 1 },
    { ...placement, instance: 2, anchorPart: "head", flipX: true },
    { ...placement, instance: 3, anchorPart: "left_ear" },
    { ...placement, instance: 4, anchorPart: "right_ear" },
    { ...placement, view: "side", instance: 1 },
  ]);
  assert.equal(allowed.success, true);
  if (allowed.success) {
    assert.equal(allowed.data[0].flipX, false);
    assert.equal(allowed.data[1].flipX, true);
  }
  assert.equal(costumePlacementsSchema.safeParse([{ ...placement, instance: 5 }]).success, false);
  assert.equal(costumePlacementsSchema.safeParse([
    { ...placement, instance: 2 },
    { ...placement, instance: 2, anchorPart: "head" },
  ]).success, false);
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

