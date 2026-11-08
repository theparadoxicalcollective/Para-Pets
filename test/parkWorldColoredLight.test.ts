import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isParkEffect, isParkOutdoorEffect, isValidParkLightColor,
  parkLightColor, DEFAULT_PARK_LIGHT_COLOR,
} from "../shared/petParkEffects";
import { isValidParkDecorEffects } from "../shared/petParkDecorEffects";
import { parkOutdoorLightEffects, parkOutdoorLightRadius } from "../shared/petParkAtmosphere";
import { parkOutdoorEffectOpacity, parkSceneLampMaskChannel } from "../client/src/lib/parkSceneLighting";

const read = (file: string) => readFileSync(file, "utf8");
const colored = { id: "orb1", type: "colored_light" as const,
  x: 0.45, y: 0.42, size: 24, color: "#7755cc" };

test("Colored Light exists only in park/world effects and saves validated orb colors", () => {
  assert.equal(isParkEffect("colored_light"), true);
  assert.equal(isParkOutdoorEffect("colored_light"), false,
    "the new effect must not leak into Pet Home controls");
  assert.equal(isValidParkLightColor("#7755cc"), true);
  assert.equal(isValidParkLightColor("#AABBCC"), true);
  for (const invalid of ["red", "#f00", "#00112233", "var(--red)", "url(evil)", "", null]) {
    assert.equal(isValidParkLightColor(invalid), false);
  }
  assert.equal(parkLightColor("red"), DEFAULT_PARK_LIGHT_COLOR);
  assert.equal(parkLightColor(colored.color), colored.color);
  assert.equal(isValidParkDecorEffects([colored]), true);
  assert.equal(isValidParkDecorEffects([{ ...colored, color: undefined }]), false);
  assert.equal(isValidParkDecorEffects([{ ...colored, color: "rgb(1,2,3)" }]), false);
  assert.equal(isValidParkDecorEffects([{ ...colored, type: "lamp_light" }]), true,
    "existing Lamp Light also supports optional color without replacing its type");
  assert.equal(isValidParkDecorEffects([{ ...colored, type: "lamp_light", color: undefined }]), true);
});

test("Colored Light uses the SAME neutral lamp cutout for both standalone and attached effects", () => {
  const geometry = { width: 1400, height: 1600, scale: 1 };
  const lights = parkOutdoorLightEffects([
    { id: "standalone", kind: "effect", effectType: "colored_light",
      xPct: .5, yPct: .5, size: 80, flipped: false },
    { id: "decor", kind: "decor", xPct: .4, yPct: .3, size: 250,
      flipped: false, decorEffects: [colored] },
    { id: "building", kind: "building", xPct: .6, yPct: .6, size: 340,
      flipped: false, decorEffects: [colored] },
  ], geometry, { x: 0, y: 0 }, { width: 1400, height: 1600 });
  assert.deepEqual(lights.map(light => light.id),
    ["standalone", "decor-orb1", "building-orb1"]);
  assert.ok(lights.every(light => light.type === "lamp_light"),
    "color never changes the mask type or tints surrounding scenery");
  assert.ok(lights.every(light => parkOutdoorLightRadius(light, 1600, true) > 0));
  for (const [night, expected] of [[0, 0], [0.5, 0.5], [1, 1]]) {
    assert.equal(parkOutdoorEffectOpacity("colored_light", night), expected);
    assert.equal(parkOutdoorEffectOpacity("lamp_light", night), expected);
  }
  assert.equal(parkSceneLampMaskChannel(1, 1), parkSceneLampMaskChannel(1, 1),
    "neutral scenery illumination is color-independent");
  assert.equal(parkSceneLampMaskChannel(1, 0), 255);
});

test("admin can select and persist orb color in both editors, not scene wash", () => {
  const parkEditor = read("client/src/components/PetParkDecorEffectEditor.tsx");
  const worldEditor = read("client/src/components/world-editor/WorldDecorEffectEditor.tsx");
  const park = read("client/src/components/PetParkAdminPanel.tsx");
  const world = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const visual = read("client/src/components/HomeInteriorEffect.tsx");
  const sceneVisual = read("client/src/components/ParkEffectVisual.tsx");
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  for (const editor of [parkEditor, worldEditor]) {
    assert.match(editor, /type="color" aria-label="Colored light orb color"/);
    assert.match(editor, /selected\?\.type === "lamp_light"/);
    assert.match(editor, /color: event\.target\.value/);
    assert.match(editor, /type === "colored_light"/);
  }
  assert.match(park, /New Pet Park colored light orb color/);
  assert.match(world, /New world colored light orb color/);
  assert.match(world, /Edit world colored light orb color/);
  assert.match(read("client/src/pages/PetParkPage.tsx"), /Edit Pet Park colored light orb color/);
  assert.match(sceneVisual, /type === "colored_light"/);
  assert.match(sceneVisual, /type === "lamp_light" && color/);
  assert.match(sceneVisual, /orbColor=\{parkLightColor\(color\)\}/);
  assert.match(visual, /const channels = orbColor &&/);
  assert.match(visual, /background: channels/);
  assert.match(visual, /if \(type === "fire"\) return <CampfireVisual/);
  assert.doesNotMatch(atmosphere, /orbColor|effect\.color/,
    "color must NEVER affect the surrounding darkness reveal");
  assert.doesNotMatch(atmosphere, /park-outdoor-lamp-warm-spill/,
    "no extra wash or obsolete amber background layer");
});

test("standalone color uses narrow additive storage and server-side validation", () => {
  const schema = read("shared/schema.ts");
  const parkBoot = read("server/startup/migrations/ensurePetParkStorage.ts");
  const worldBoot = read("server/startup/migrations/ensureWorldSceneContentStorage.ts");
  const parkRoutes = read("server/routes/petParkAdmin.routes.ts");
  const worldRoutes = read("server/routes/worldSceneContent.routes.ts");
  assert.equal((schema.match(/effectColor: text\("effect_color"\)/g) ?? []).length, 2);
  assert.match(parkBoot, /pet_park_scene_items ADD COLUMN IF NOT EXISTS effect_color text/);
  assert.match(worldBoot, /world_scene_placements ADD COLUMN IF NOT EXISTS effect_color text/);
  assert.match(parkRoutes, /isValidParkLightColor\(effectColor\)/);
  assert.match(parkRoutes, /isValidParkLightColor\(req\.body\?\.effectColor\)/);
  assert.match(parkRoutes, /effectType, "colored_light"/);
  assert.match(worldRoutes, /isValidParkLightColor\(effectColor\)/);
  assert.match(worldRoutes, /isValidParkLightColor\(body\.effectColor\)/);
  assert.match(read("client/src/pages/WorldSceneEditorPage.tsx"), /color=\{p\.effectColor \?\? undefined\}/);
});
