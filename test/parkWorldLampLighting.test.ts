import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getHouseInteriorLightRadiusRatio } from "../shared/housing";
import { parkOutdoorLightEffects, parkOutdoorLightRadius } from "../shared/petParkAtmosphere";
import { parkSceneDarkness, parkOutdoorEffectOpacity } from "../client/src/lib/parkSceneLighting";
import { getAutomaticHomeNightStrength } from "../client/src/lib/homeOutdoorLighting";
import { isPlayerToggleableInteriorEffect } from "../client/src/components/HomeInteriorEffect";

const source = (path: string) => readFileSync(path, "utf8");
const at = (hour: number) => new Date(2026, 10, 7, hour, 0);

test("Pet Park and World Editor darken more at night without changing home lighting", () => {
  assert.equal(parkSceneDarkness(0), 0);
  assert.equal(parkSceneDarkness(.5), 44);
  assert.equal(parkSceneDarkness(1), 88);
  assert.equal(parkSceneDarkness(5), 88);
  assert.equal(parkSceneDarkness(-5), 0);
  assert.equal(parkSceneDarkness(Number.NaN), 0);
  const home = source("client/src/lib/homeOutdoorLighting.ts");
  assert.match(home, /HOME_OUTDOOR_NIGHT_DARKNESS = 78/);
  const park = source("client/src/pages/PetParkPage.tsx");
  const world = source("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(park, /darkness=\{parkSceneDarkness\(parkLighting\.nightStrength\)\}/);
  assert.match(world, /darkness=\{parkSceneDarkness\(worldLighting\.nightStrength\)\}/);
  assert.match(park, /useHomeOutdoorLighting\("auto"\)/);
  assert.match(world, /useHomeOutdoorLighting\("auto"\)/);
});

test("outdoor lamps follow nightfall, sunlight follows daytime, fires remain independent", () => {
  for (const [hour, expectedNight] of [[2, 1], [12, 0], [19, .5]]) {
    const night = getAutomaticHomeNightStrength(at(hour));
    assert.equal(night, expectedNight);
    assert.equal(parkOutdoorEffectOpacity("lamp_light", night), night);
    assert.equal(parkOutdoorEffectOpacity("candle_light", night), night);
    assert.equal(parkOutdoorEffectOpacity("warm_glow", night), 1 - night);
    assert.equal(parkOutdoorEffectOpacity("fire", night), 1);
  }
  const masks = source("client/src/components/HomeOutdoorAtmosphere.tsx");
  assert.match(masks, /effect\.type === "lamp_light" \|\| effect\.type === "candle_light"/);
  assert.match(masks, /baseStrength \* safeNight/);
  assert.match(masks, /baseStrength \* \(1 - safeNight\)/);
  assert.match(masks, /parkOutdoorLightRadius\(effect, maskHeight, isSceneLamp\(effect\)\)/);
  assert.match(source("client/src/components/PetParkDecorEffects.tsx"), /parkOutdoorEffectOpacity\(effect\.type, nightStrength\)/);
  assert.match(source("client/src/components/world-editor/WorldDecorEffects.tsx"), /parkOutdoorEffectOpacity\(effect\.type, nightStrength\)/);
});

test("lamp light reveal follows authored size for decor, building facades and indoor effects", () => {
  const facade = { id: "building-1", kind: "building", xPct: .5, yPct: .5,
    size: 320, flipped: false, decorEffects: [
      { id: "lamp", type: "lamp_light" as const, x: .55, y: .34, size: 28 },
    ] };
  const decor = { id: "decor-1", kind: "decor", xPct: .2, yPct: .3,
    size: 120, flipped: true, decorEffects: [
      { id: "lamp2", type: "lamp_light" as const, x: .35, y: .45, size: 20 },
    ] };
  const stage = { width: 1800, height: 2400, scale: 1 };
  const lights = parkOutdoorLightEffects([facade, decor], stage, {x:0,y:0}, {width:1800,height:2400});
  assert.deepEqual(lights.map(light => light.id), ["building-1-lamp", "decor-1-lamp2"]);
  assert.ok(lights[0].size > lights[1].size, "larger facade lamp reveals a larger area");
  assert.ok(getHouseInteriorLightRadiusRatio({ id:"s", type:"lamp_light", x:.5,y:.5,size:32 }) >
    getHouseInteriorLightRadiusRatio({ id:"s", type:"lamp_light", x:.5,y:.5,size:16 }));
  const interiors = source("client/src/components/HomeInteriorEffect.tsx");
  assert.match(interiors, /Math\.max\(12, getHouseInteriorLightRadiusRatio\(effect\) \* height\)/);
  assert.match(source("client/src/pages/WorldSceneEditorPage.tsx"), /<HomeInteriorDarknessLayer darkness=\{35\} effects=\{interiorLights\}/);
});

test("outdoor facade lamp storage is additive and scoped; indoor sunlight stays automatic and untappable", () => {
  const schema = source("shared/schema.ts");
  const storage = source("server/startup/migrations/ensurePetParkStorage.ts");
  const parkRoutes = source("server/routes/petParkAdmin.routes.ts");
  const worldRoutes = source("server/routes/worldSceneContent.routes.ts");
  const parkEditor = source("client/src/components/PetParkBuildingDetails.tsx");
  const worldEditor = source("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.match(schema, /exteriorEffects: jsonb\("exterior_effects"\)/);
  assert.match(storage, /pet_park_buildings ADD COLUMN IF NOT EXISTS exterior_effects jsonb NOT NULL/);
  assert.match(parkRoutes, /if \(body\.exteriorEffects !== undefined\)/);
  assert.match(parkRoutes, /isValidParkDecorEffects\(body\.exteriorEffects\)/);
  assert.match(worldRoutes, /saved\.kind !== "decor" && saved\.kind !== "building"/);
  assert.match(parkEditor, /PetParkDecorEffectEditor/);
  assert.match(worldEditor, /Exterior building lights & effects/);
  assert.match(source("client/src/pages/PetParkPage.tsx"), /effects=\{building\.exteriorEffects \?\? \[\]\}/);
  assert.match(source("client/src/pages/WorldSceneEditorPage.tsx"), /p\.kind === "decor" \|\| p\.kind === "building"/);
  assert.equal(isPlayerToggleableInteriorEffect("lamp_light"), true);
  assert.equal(isPlayerToggleableInteriorEffect("warm_glow"), false);
  assert.match(source("client/src/pages/PetParkPage.tsx"), /if \(effect\.type === "warm_glow"\) return/);
  assert.match(source("client/src/components/HomeInteriorEffect.tsx"), /pointerEvents: interactive \|\| playerToggleable \? "auto" : "none"/);
});

test("Pet Park and World Editor have warm lamp centers and smooth scene-only falloff", () => {
  const atmosphere = source("client/src/components/HomeOutdoorAtmosphere.tsx");
  const artwork = source("client/src/components/HomeInteriorEffect.tsx");
  const wrapper = source("client/src/components/ParkEffectVisual.tsx");
  const park = source("client/src/pages/PetParkPage.tsx");
  const world = source("client/src/pages/WorldSceneEditorPage.tsx");

  assert.match(park, /<HomeOutdoorAtmosphereLayer parkLampFalloff/);
  assert.match(world, /<HomeOutdoorAtmosphereLayer parkLampFalloff/);
  assert.match(atmosphere, /parkLampFalloff = false/,
    "existing Pet Home outdoor lighting retains its original fallback");
  assert.match(atmosphere, /parkOutdoorLightRadius\(effect, maskHeight, isSceneLamp\(effect\)\)/);
  assert.match(atmosphere, /<stop offset="12%" stopColor="black" stopOpacity=\{cutoutStrength \* 0\.87\}/);
  assert.match(atmosphere, /<stop offset="30%" stopColor="black" stopOpacity=\{cutoutStrength \* 0\.74\}/);
  assert.match(atmosphere, /<stop offset="50%" stopColor="black" stopOpacity=\{cutoutStrength \* 0\.53\}/);
  assert.match(atmosphere, /<stop offset="86%" stopColor="black" stopOpacity=\{cutoutStrength \* 0\.10\}/);
  assert.match(atmosphere, /<stop offset="100%" stopColor="black" stopOpacity=\{0\}/);
  assert.match(atmosphere, /data-testid="park-outdoor-lamp-warm-spill"/);
  assert.match(atmosphere, /stopColor="#f7c168"/);
  assert.match(atmosphere, /opacity: safeNight/);

  assert.match(wrapper, /warmSceneLamp/);
  assert.match(artwork, /function LampLightVisual\(\{ warmSceneLamp = false \}/);
  assert.match(artwork, /rgba\(255,199,91,0\.28\)/,
    "scene lamp core is amber, not near-white");
  assert.match(artwork, /<EffectVisual type=\{effect\.type\} adminPreview=\{interactive\} \/>/,
    "indoor lights and player toggles are not modified by the outdoor scene palette");

  const relativeStops = [0.92, 0.87, 0.74, 0.53, 0.29, 0.10, 0];
  const stops = [0, 0.12, 0.30, 0.50, 0.70, 0.86, 1];
  for (let i = 1; i < relativeStops.length; i++) {
    assert.ok(relativeStops[i] < relativeStops[i - 1], "reveal falls off with distance");
    assert.ok(stops[i] > stops[i - 1], "falloff covers a continuous increasing radius");
  }
  for (const size of [0.6, 1.2, 2.4]) {
    // Percent of scene height: a 1.2% visible lamp on a 1200px scene
    // is just 14.4px wide, yet should softly illuminate ~100px outwards.
    const light = { id: "lamp", type: "lamp_light" as const, x: .5, y: .5, size };
    const visualDiameter = 1200 * size / 100;
    const wideRadius = parkOutdoorLightRadius(light, 1200, true);
    const legacyRadius = parkOutdoorLightRadius(light, 1200, false);
    assert.ok(wideRadius > 5 * visualDiameter,
      "the light travels much farther than the small visual flare");
    assert.ok(wideRadius > legacyRadius * 2, "the previous narrow reach is substantially extended");
    assert.equal(legacyRadius, getHouseInteriorLightRadiusRatio(light) * 1200);
    assert.ok(parkOutdoorLightRadius({ ...light, size: size * 1.5 }, 1200, true) > wideRadius,
      "the illuminated ground radius follows the saved lamp size");
  }
  assert.equal(parkOutdoorLightRadius(
    { id: "lamp", type: "lamp_light", x: .5, y: .5, size: 100 },
    1200, true), 1200 * 0.68, "large lamps keep the existing scene-safe maximum");
  assert.match(artwork, /opacity: warmSceneLamp \? 0\.38 : 0\.57/,
    "the visible flare is more transparent while its scenery reveal grows");
});

test("lamp artwork center is less opaque but SVG illumination cutouts remain", () => {
  const effects = source("client/src/components/HomeInteriorEffect.tsx");
  assert.match(effects, /data-testid="home-lamp-light-core"/);
  assert.match(effects, /rgba\(255,253,229,0\.34\)/);
  assert.match(effects, /data-testid="home-lamp-light-halo"/);
  assert.match(effects, /data-testid="home-lamp-light-diffusion"/);
  assert.match(effects, /getHouseInteriorLightCutoutStrength\(effect\.type\)/);
  assert.match(source("client/src/components/HomeOutdoorAtmosphere.tsx"), /getHouseInteriorLightCutoutStrength\(effect\.type\)/);
});
