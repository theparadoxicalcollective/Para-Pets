import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_ACTIVE_PET_ANCHOR, DEFAULT_PET_PRESENTATION, activePetAnchorSchema, defaultXEyes, parseActivePetAnchor, parsePetPresentation, petPresentationSchema } from "../shared/petPresentation";

test("unconfigured pets retain their existing placement", () => {
  assert.deepEqual(parsePetPresentation(undefined), DEFAULT_PET_PRESENTATION);
  assert.deepEqual(parsePetPresentation({}), DEFAULT_PET_PRESENTATION);
});
test("saved placement validates whole-pet scale and per-head eye positions", () => {
  const placement = { x: -12, y: 5, scale: .7, eyes: { h2_head: { x: 420, y: 315, size: 35 } } };
  assert.deepEqual(parsePetPresentation(placement), placement);
  for (const invalid of [{ ...placement, scale: 0 }, { ...placement, scale: Infinity }, { ...placement, y: 101 }, { ...placement, eyes: { head: { x: 0, y: 0, size: -1 } } }]) {
    assert.equal(petPresentationSchema.safeParse(invalid).success, false);
  }
});
test("automatic X eyes use the matching head's eyes instead of another head", () => {
  const head = { partType: "h2_head", posX: 100, posY: 200, width: 300, height: 250 };
  const parts = [head, { partType: "eyes", posX: 0, posY: 0, width: 100, height: 100 }, { partType: "h2_eyes", posX: 150, posY: 240, width: 100, height: 50 }];
  assert.deepEqual(defaultXEyes(head, parts), { x: 200, y: 265, size: 30 });
  assert.deepEqual(defaultXEyes(head, [head]), { x: 250, y: 312.5, size: 36 });
});


test("the active-page oval is one global Admin setting, separate from per-pet placement", () => {
  assert.deepEqual(parseActivePetAnchor(undefined), DEFAULT_ACTIVE_PET_ANCHOR);
  assert.deepEqual(parseActivePetAnchor({ x: 8, y: -4 }), { x: 8, y: -4 });
  assert.equal(activePetAnchorSchema.safeParse({ x: 101, y: 0 }).success, false);

  const routes = readFileSync("server/routes/petPresentation.routes.ts", "utf8");
  assert.match(routes, /anchorSettingKey = "active_pet_anchor:v1"/);
  assert.match(routes, /app\.get\(anchorRoute, requireAuthenticated/);
  assert.match(routes, /app\.put\(anchorRoute, requireAdmin/);

  const placement = readFileSync("client/src/components/ActivePetPlacement.tsx", "utf8");
  assert.match(placement, /useActivePetAnchor\(!editor\)/);
  assert.match(placement, /getStablePetGroundPoint\(visibleParts\)/);
  assert.match(placement, /kind: "anchor"/);
  assert.match(placement, /anchorQuery\.save\.mutate/);
  assert.match(placement, /query\.save\.mutate\(\{ \.\.\.query\.placement, x: value\.x, y: value\.y, scale: value\.scale \}/);
  assert.match(placement, /getPetPlacementTransform\(ground, value, editor \? DEFAULT_ACTIVE_PET_ANCHOR : anchor\)/);
  assert.doesNotMatch(placement, /PET_SPOT\.x \/ 10 \+ \(editor \? 0 : value\.x\)/);
});
