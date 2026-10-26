import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const routes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");

test("Pet Park creates buildings, decor, rest spots and effects in the real world scene", () => {
  for (const mode of ["effects", "decor", "scene"]) {
    assert.ok(page.includes(`beginCreate("${mode}")`), `toolbar opens contextual ${mode} creation`);
  }
  assert.ok(page.includes('mode="create" creationPosition={creationPosition}'));
  assert.ok(page.includes('(viewportSize.width / 2 - camera.x) / sceneWidth'));
  assert.ok(page.includes('(viewportSize.height / 2 - camera.y) / sceneHeight'));
  assert.ok(panel.includes('mode === "create"'), "reuse creation forms without requiring a second scene preview");
  assert.ok(!panel.includes('mode === "editor"'), "retired full-screen editor must not remain");
  assert.ok(!page.includes('Advanced edit'), "all object editing stays in the actual world scene");
  assert.ok(page.includes('Fine-tune exact placement'), "preserve numeric coordinate editing from old panel");
  assert.ok(page.includes('Park object ${field}'), "position fields are available for precision editing");
  assert.ok(panel.includes('creationPosition?.xPct ?? 0.5'));
  assert.ok(panel.includes('creationPosition?.yPct ?? 0.5'));
  assert.ok(panel.includes('url: "/api/admin/pet-park/buildings"'));
  assert.ok(panel.includes('url: "/api/admin/pet-park/items"'));
  assert.ok(panel.includes('label: "Rest Spot"'), "Rest Spot is available in the decor picker");
  assert.ok(panel.includes('type: "water_ripple"'), "Water ripples remain available in the effect picker");
  assert.ok(panel.includes('HOME_OUTDOOR_EFFECT_OPTIONS.map'), "Home Bundle outdoor effects are offered without duplication");
  assert.ok(page.includes('setSelectedPlacement({ kind: object.kind, id: object.id })'));
  assert.ok(!page.includes('placementMode'), "objects edit directly without a separate Move mode");
});

test("in-scene edits autosave positions, keep optional exact fields and allow deselection", () => {
  assert.ok(page.includes('size: Math.min(1000, placementDraft.size + 20)'));
  assert.ok(page.includes('size: Math.max(1, placementDraft.size - 20)'));
  assert.ok(page.includes('flipped: !placementDraft.flipped'));
  assert.ok(page.includes('shownPosition("building", building).size * scale'));
  assert.ok(page.includes('kind: "item", layer: shownPosition("item", item).layer'), "item layering now combines ground depth and admin override");
  assert.ok(page.includes('return apiRequest("PATCH", path, placement)'), "PATCH includes coordinates, size, flip and layer");
  assert.ok(page.includes('placementSave.mutate({ ...selectedPlacement, ...placementDraft })'));
  assert.ok(page.includes('setSelectedPlacement(null); setPlacementDraft(null);'), "tapping Done or blank ground deselects");
  assert.ok(page.includes('window.confirm("Remove this object from Pet Park?")'), "confirmation remains for non-terrain objects");
  assert.ok(page.includes('(selectedObject as ParkItem).kind === "terrain"'), "terrain removes without confirmation");
  assert.ok(routes.includes('app.patch("/api/admin/pet-park/items/:id", isAdmin'));
  assert.ok(routes.includes('!validSize(size)'));
  assert.ok(routes.includes('typeof flipped !== "boolean"'));
});
