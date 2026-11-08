import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getParkLampStrength, getParkFireflyStrength, isNightInteriorArtworkActive } from "../client/src/lib/homeOutdoorLighting";
import { parkOutdoorEffectOpacity } from "../client/src/lib/parkSceneLighting";

const read = (file: string) => readFileSync(file, "utf8");
const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m);

test("park and world scene light artwork and illumination honor 06:00 cutoff", () => {
  const nightShadeAtDawn = 0.75;
  for (const kind of ["lamp_light", "candle_light", "colored_light"]) {
    assert.equal(parkOutdoorEffectOpacity(kind, nightShadeAtDawn, 0, getParkLampStrength("auto", at(6))), 0);
    assert.ok(parkOutdoorEffectOpacity(kind, nightShadeAtDawn, 0, getParkLampStrength("auto", at(5, 59))) > 0);
    assert.ok(parkOutdoorEffectOpacity(kind, 0.2, 0, getParkLampStrength("auto", at(18, 45))) > 0);
  }
  assert.equal(parkOutdoorEffectOpacity("fireflies", nightShadeAtDawn, getParkFireflyStrength("auto", at(6))), 0);
  assert.equal(parkOutdoorEffectOpacity("fireflies", nightShadeAtDawn, getParkFireflyStrength("auto", at(18, 59))), 0);
  assert.ok(parkOutdoorEffectOpacity("fireflies", nightShadeAtDawn, getParkFireflyStrength("auto", at(19, 1))) > 0);
  assert.equal(parkOutdoorEffectOpacity("warm_glow", 0.75, 0, 0), 0.25,
    "sunlight preserves gradual dawn/dusk background transition");
  assert.equal(parkOutdoorEffectOpacity("fire", 0.8, 0, 0), 1,
    "campfire effect does not depend on the outdoor-lamp cutoff");
});

test("both editors wire the same clock outputs to visuals and mask", () => {
  const park = read("client/src/pages/PetParkPage.tsx");
  const world = read("client/src/pages/WorldSceneEditorPage.tsx");
  const layer = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  assert.match(park, /lampStrength=\{parkLighting\.lampStrength\}/);
  assert.match(world, /lampStrength=\{worldLighting\.lampStrength\}/);
  assert.match(park, /nightArtworkActive=\{parkLighting\.nightInteriorArtworkActive\}/);
  assert.match(world, /display: previewNightInteriorArtworkActive \? "block" : "none"/);
  assert.match(layer, /parkSceneLampMaskChannel\(safeLamp, falloff\)/);
  assert.match(layer, /getParkLampStrength/);
  assert.match(layer, /Date\.now\(\) % 30_000/,
    "clock refresh is aligned to exact minute/half-minute boundaries");
  assert.equal(isNightInteriorArtworkActive("auto", at(19)), true);
  assert.equal(isNightInteriorArtworkActive("auto", at(6, 30)), false);
});

test("world camera updates are frame-batched without changing placement storage", () => {
  const world = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(world, /cameraFrame = useRef<number \| null>/);
  assert.match(world, /window\.requestAnimationFrame/);
  assert.match(world, /queueCameraUpdate\(parkClampCamera/);
  assert.match(world, /window\.cancelAnimationFrame/);
  assert.match(world, /\/api\/admin\/world-editor\/\$\{worldId\}\/\$\{endpoint\}\/\$\{id\}/);
});

test("new park buildings never inherit a previous building's uploaded night image", () => {
  const panel = read("client/src/components/PetParkAdminPanel.tsx");
  assert.match(panel, /setBuildingImage\(null\); setInteriorImage\(null\); setNightInteriorImage\(null\)/);
  assert.match(panel, /nightInteriorImageData: nightInteriorImage/);
});
