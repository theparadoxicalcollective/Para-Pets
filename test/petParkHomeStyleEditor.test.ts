import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOUSE_OUTDOOR_EFFECT_TYPES } from "../shared/housing";
import {
  isParkEffect, isParkOutdoorEffect, isParkWaterEffect, PARK_WATER_EFFECT_TYPES,
} from "../shared/petParkEffects";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const visual = readFileSync("client/src/components/ParkEffectVisual.tsx", "utf8");
const home = readFileSync("client/src/components/HomeInteriorEffect.tsx", "utf8");
const routes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");

test("Pet Park supports all seven Home Bundle outdoor effects and retains three water effects", () => {
  assert.deepEqual([...HOUSE_OUTDOOR_EFFECT_TYPES].sort(), [
    "candle_light", "dust_motes", "fire", "lamp_light", "soft_mist", "sparkles", "warm_glow",
  ]);
  assert.equal(HOUSE_OUTDOOR_EFFECT_TYPES.length + PARK_WATER_EFFECT_TYPES.length, 10);
  for (const type of [...HOUSE_OUTDOOR_EFFECT_TYPES, ...PARK_WATER_EFFECT_TYPES]) {
    assert.equal(isParkEffect(type), true, `unsupported ${type}`);
  }
  for (const invalid of ["sleep", "arbitrary", "", null, 1]) {
    assert.equal(isParkEffect(invalid), false);
  }
  assert.equal(isParkOutdoorEffect("fire"), true);
  assert.equal(isParkWaterEffect("fire"), false);
  assert.match(routes, /kind === "effect" && !isParkEffect\(effectType\)/);
  assert.match(routes, /isAdmin/);
});

test("home outdoor artwork is reused, not duplicated, for Pet Park visuals", () => {
  assert.match(visual, /<HomeOutdoorEffectVisual type=\{type\} reducedMotion=\{reducedMotion\}/);
  assert.match(home, /export function HomeOutdoorEffectVisual/);
  assert.match(home, /<EffectVisual type=\{type\} adminPreview=\{false\}/);
  assert.match(home, /prefers-reduced-motion: reduce/);
  assert.match(page, /<ParkEffectVisual type=\{item.effectType\}/);
});

test("mobile Pet Park editor matches the Home Bundle layout while keeping actual park placement", () => {
  assert.match(page, /\+ Add Effects/);
  assert.match(page, /\+ Add Decor \/ Objects/);
  assert.match(page, /\+ Add Buildings/);
  assert.match(page, /Move park objects/);
  assert.match(page, /Expand Ground/);
  assert.match(page, /Zoom in to Pet Park/);
  assert.match(page, /Zoom out of Pet Park/);
  assert.match(page, /api\/admin\/pet-park\/ground/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /max-h-\[min\(78dvh,780px\)\]/);
  assert.match(page, /pb-\[max\(24px,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(page, /beginCreate\("effects"\)/);
  assert.match(page, /beginCreate\("decor"\)/);
  assert.match(page, /beginCreate\("scene"\)/);
  assert.match(page, /xPct: Math.max\(0, Math.min\(1, \(viewportSize.width \/ 2 - camera.x\) \/ sceneWidth\)\)/);
  assert.match(page, /setSelectedPlacement\(\{ kind: object.kind, id: object.id \}\)/);
  assert.doesNotMatch(page, /Advanced edit/);
});

test("effect picker exposes Home effect cards and existing water options", () => {
  assert.match(panel, /HOME_OUTDOOR_EFFECT_OPTIONS\.map\(option/);
  assert.match(panel, /WATER_EFFECT_OPTIONS\.map\(option/);
  for (const type of PARK_WATER_EFFECT_TYPES) assert.ok(panel.includes(type));
  assert.match(panel, /onClick=\{\(\) => addEffect\(option.type/);
  assert.match(panel, /disabled=\{mutation.isPending\}/);
  assert.match(panel, /Interactive rest spot|Rest Spot/);
  assert.match(panel, /aria-pressed=\{buildingCapacity === capacity\}/);
  assert.match(panel, /data-testid="button-create-park-building"/);
  assert.match(panel, /data-testid="button-create-park-item"/);
  assert.match(panel, /Upload Building Image/);
  assert.match(panel, /mode === "settings"/);
});
