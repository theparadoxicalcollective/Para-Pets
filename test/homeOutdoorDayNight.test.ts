import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOUSE_OUTDOOR_EFFECT_TYPES,
  sanitizeHouseOutdoorEffects,
} from "../shared/housing";
import {
  HOME_OUTDOOR_NIGHT_DARKNESS,
  cycleHomeOutdoorLightingMode,
  getAutomaticHomeNightStrength,
  getHomeOutdoorDarkness,
} from "../client/src/lib/homeOutdoorLighting";

const read = (path: string) => readFileSync(path, "utf8");
const at = (hour: number, minute = 0) => new Date(2026, 9, 3, hour, minute, 0);

test("automatic Home lighting eases through dawn and dusk using the player's local clock", () => {
  assert.equal(getAutomaticHomeNightStrength(at(4)), 1);
  assert.equal(getAutomaticHomeNightStrength(at(5, 30)), 1);
  assert.equal(getAutomaticHomeNightStrength(at(6, 30)), 0.5);
  assert.equal(getAutomaticHomeNightStrength(at(7, 30)), 0);
  assert.equal(getAutomaticHomeNightStrength(at(12)), 0);
  assert.equal(getAutomaticHomeNightStrength(at(18)), 0);
  assert.equal(getAutomaticHomeNightStrength(at(19)), 0.5);
  assert.equal(getAutomaticHomeNightStrength(at(20)), 1);
  assert.equal(getHomeOutdoorDarkness("day", at(23)), 0);
  assert.equal(getHomeOutdoorDarkness("night", at(12)), HOME_OUTDOOR_NIGHT_DARKNESS);
});

test("day-night control cycles auto to sun, moon, and back to automatic", () => {
  assert.equal(cycleHomeOutdoorLightingMode("auto"), "day");
  assert.equal(cycleHomeOutdoorLightingMode("day"), "night");
  assert.equal(cycleHomeOutdoorLightingMode("night"), "auto");
});

test("outdoor Home effects reuse safe visual effects but exclude the interior Sleep Square", () => {
  assert.deepEqual(HOUSE_OUTDOOR_EFFECT_TYPES, [
    "fire",
    "candle_light",
    "warm_glow",
    "sparkles",
    "dust_motes",
    "soft_mist",
  ]);
  assert.deepEqual(
    sanitizeHouseOutdoorEffects([
      { id: "fire", type: "fire", x: -1, y: 2, size: 99 },
      { id: "sleep", type: "sleep", x: 0.5, y: 0.5, size: 18 },
      { id: "mist", type: "soft_mist", x: 0.4, y: 0.6, size: 20 },
    ]),
    [
      { id: "fire", type: "fire", x: 0, y: 1, size: 40 },
      { id: "mist", type: "soft_mist", x: 0.4, y: 0.6, size: 20 },
    ],
  );
});

test("owner and visitor Home yards render the same day-night atmosphere and saved outdoor effects", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /useHomeOutdoorLighting\(\)/);
    assert.match(source, /HomeOutdoorAtmosphereLayer/);
    assert.match(source, /effects=\{activeBundle\?\.exteriorEffects \?\? \[\]\}/);
    assert.match(source, /<HomeInteriorEffectsLayer[\s\S]*activeBundle\?\.exteriorEffects/);
    assert.match(source, /HomeDayNightToggle/);
  }

  assert.match(atmosphere, /HOME_OUTDOOR_LIGHTING_STORAGE_KEY/);
  assert.match(atmosphere, /window\.setInterval\(\(\) => setNow\(new Date\(\)\), 30_000\)/);
  assert.match(atmosphere, /data-lighting-mode=\{mode\}/);
  assert.match(atmosphere, /<Sun /);
  assert.match(atmosphere, /<Moon /);
  assert.match(atmosphere, /function AutoLightingIcon/);
  assert.doesNotMatch(atmosphere, /☀️|🌙/);
});

test("night darkness is cut away by saved outdoor lights while decorative effects remain above it", () => {
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(atmosphere, /<HomeInteriorDarknessLayer[\s\S]*darkness=\{darkness\}[\s\S]*effects=\{effects\}/);
  assert.match(atmosphere, /data-testid="home-outdoor-night-tint"/);
  for (const source of [owner, visitor]) {
    assert.match(source, /zIndex=\{20\}/);
    assert.match(source, /<HomeInteriorEffectsLayer[\s\S]*zIndex=\{21\}/);
  }
});

test("Admin Home bundle background editor can add, drag, resize, and delete outdoor effects", () => {
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(effects, /HOME_OUTDOOR_EFFECT_OPTIONS = HOME_INTERIOR_EFFECT_OPTIONS\.filter/);
  assert.match(admin, /data-testid="button-add-outdoor-effect"/);
  assert.match(admin, /HOME_OUTDOOR_EFFECT_OPTIONS\.map/);
  assert.match(admin, /onExteriorEffectPointerDown/);
  assert.match(admin, /onExteriorEffectPointerMove/);
  assert.match(admin, /onExteriorEffectPointerCancel/);
  assert.match(admin, /resizeSelectedExteriorEffect/);
  assert.match(admin, /deleteSelectedExteriorEffect/);
  assert.match(admin, /exteriorEffectsSaveQueueRef/);
  assert.match(admin, /exteriorEffects: next/);
});

test("outdoor effects persist on Home bundles and the server sanitizes Admin updates", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const routes = read("server/routes/houseBundle.routes.ts");

  assert.match(schema, /exteriorEffects: jsonb\("exterior_effects"\)/);
  assert.match(boot, /house_bundles ADD COLUMN IF NOT EXISTS exterior_effects JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(routes, /sanitizeHouseOutdoorEffects/);
  assert.match(routes, /exteriorEffects must be an array/);
  assert.match(routes, /updates\.exteriorEffects = sanitizeHouseOutdoorEffects\(exteriorEffects\)/);
});
