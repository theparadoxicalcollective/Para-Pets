import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOUSE_INTERIOR_DARKNESS_MAX,
  HOUSE_INTERIOR_EFFECT_MAX_COUNT,
  HOUSE_INTERIOR_EFFECT_TYPES,
  HOUSE_INTERIOR_LIGHT_BASE_BRIGHTNESS_BOOST,
  HOUSE_INTERIOR_LIGHT_MAX_BRIGHTNESS_BOOST,
  PET_HOUSE_PLAYER_MAX_SCALE,
  PET_HOUSE_PLAYER_MIN_SCALE,
  clampPetHousePlayerScale,
  getHouseInteriorSideDarkness,
  getHouseInteriorSleepSnapPosition,
  isHouseInteriorSleepPosition,
  sanitizeHouseInteriorDarkness,
  sanitizeHouseInteriorEffects,
} from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

test("home interior effect catalog includes the requested scene-enhancing effects", () => {
  assert.deepEqual(HOUSE_INTERIOR_EFFECT_TYPES, [
    "fire",
    "candle_light",
    "warm_glow",
    "sparkles",
    "dust_motes",
    "soft_mist",
    "sleep",
  ]);
});

test("interior darkness is bounded and defaults safely", () => {
  assert.equal(HOUSE_INTERIOR_DARKNESS_MAX, 90);
  assert.equal(sanitizeHouseInteriorDarkness(undefined), 0);
  assert.equal(sanitizeHouseInteriorDarkness(-15), 0);
  assert.equal(sanitizeHouseInteriorDarkness(37.4), 37);
  assert.equal(sanitizeHouseInteriorDarkness(120), 90);
});

test("room darkness is the lights-off baseline and active lights brighten their side", () => {
  const lights = [
    { id: "left-fire", type: "fire" as const, x: 0.2, y: 0.5, size: 14 },
    { id: "right-lamp", type: "warm_glow" as const, x: 0.8, y: 0.5, size: 18 },
    { id: "center-candle", type: "candle_light" as const, x: 0.5, y: 0.5, size: 10 },
  ];

  const allOff = new Set(lights.map(light => light.id));
  assert.deepEqual(getHouseInteriorSideDarkness(60, lights, allOff), {
    leftDarkness: 60,
    rightDarkness: 60,
    leftBoost: 0,
    rightBoost: 0,
  });

  const leftOnly = getHouseInteriorSideDarkness(60, lights, new Set(["right-lamp", "center-candle"]));
  assert.equal(leftOnly.leftBoost, HOUSE_INTERIOR_LIGHT_BASE_BRIGHTNESS_BOOST);
  assert.equal(leftOnly.leftDarkness, 50);
  assert.equal(leftOnly.rightDarkness, 60);

  const centerOnly = getHouseInteriorSideDarkness(60, lights, new Set(["left-fire", "right-lamp"]));
  assert.equal(centerOnly.leftDarkness, 50);
  assert.equal(centerOnly.rightDarkness, 50);

  const allOn = getHouseInteriorSideDarkness(60, lights);
  assert.equal(allOn.leftDarkness, 46);
  assert.equal(allOn.rightDarkness, 46);

  const manyLeftLights = Array.from({ length: 10 }, (_, index) => ({
    id: `left-${index}`,
    type: "fire" as const,
    x: 0.2,
    y: 0.5,
    size: 14,
  }));
  assert.equal(getHouseInteriorSideDarkness(90, manyLeftLights).leftBoost, HOUSE_INTERIOR_LIGHT_MAX_BRIGHTNESS_BOOST);
});

test("interior effect sanitizer keeps only supported effects and clamps scene-space values", () => {
  assert.deepEqual(
    sanitizeHouseInteriorEffects([
      { id: "fire-1", type: "fire", x: -1, y: 2, size: 99 },
      { id: "bad", type: "lightning", x: 0.5, y: 0.5, size: 12 },
      { id: "glow-1", type: "warm_glow", x: 0.35, y: 0.6, size: 2 },
    ]),
    [
      { id: "fire-1", type: "fire", x: 0, y: 1, size: 40 },
      { id: "glow-1", type: "warm_glow", x: 0.35, y: 0.6, size: 4 },
    ],
  );

  const many = Array.from({ length: 30 }, (_, index) => ({
    id: `effect-${index}`,
    type: "sparkles",
    x: 0.5,
    y: 0.5,
    size: 12,
  }));
  assert.equal(sanitizeHouseInteriorEffects(many).length, HOUSE_INTERIOR_EFFECT_MAX_COUNT);
});

test("admin interior preview exposes touch-friendly panning and effect editing", () => {
  const source = read("client/src/components/HomeBundleSection.tsx");

  assert.match(source, /button-pan-interior-left/);
  assert.match(source, /button-pan-interior-right/);
  assert.match(source, /button-add-interior-effect/);
  assert.match(source, /HOME_INTERIOR_EFFECT_OPTIONS/);
  assert.match(source, /env\(safe-area-inset-top, 0px\)/);
  assert.match(source, /max\(64px, calc\(env\(safe-area-inset-top, 0px\) \+ 34px\)\)/);
  assert.match(source, /slider-interior-darkness/);
  assert.match(source, /HomeInteriorDarknessLayer darkness=\{darkness\}/);
  assert.match(source, /interiorDarkness: selBuilding\.interiorDarkness \?\? 0/);
  assert.match(source, /interiorPreviewSaveQueueRef/);
  assert.match(source, /updateBuildingCache/);
  assert.match(source, /queueInteriorPreviewPatch/);
  assert.match(source, /pendingSaves\.finally\(\(\) => refetch\(\)\)/);
  assert.match(source, /initialEffects=\{previewBuilding\.interiorEffects\}/);
  assert.match(source, /interiorEffects: selBuilding\.interiorEffects \?\? \[\]/);
  assert.doesNotMatch(source, /await refetch\(\);[\s\S]{0,120}Failed to save effect/);
  assert.match(source, /\}, \[buildingId\]\);/);
});

test("campfire is flame-only and candle light remains a distinct renderer", () => {
  const source = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(source, /label: "Campfire"/);
  assert.match(source, /Natural open flame only/);
  assert.match(source, /function CampfireVisual/);
  assert.doesNotMatch(source, /crossed glowing logs/);
  assert.match(source, /para-home-flame-a/);
  assert.match(source, /para-home-flame-b/);
  assert.match(source, /para-home-flame-c/);
  assert.match(source, /label: "Candle Light"/);
  assert.match(source, /function CandleLightVisual/);
  assert.match(source, /type === "fire"\) return <CampfireVisual/);
  assert.match(source, /type === "candle_light"\) return <CandleLightVisual/);
});

test("Sleep Square hit testing and drop snapping use the same scene-space geometry", () => {
  const effects = [
    { id: "sleep-1", type: "sleep" as const, x: 0.5, y: 0.5, size: 20 },
  ];

  assert.equal(isHouseInteriorSleepPosition(effects, 0.5, 0.5, 2), true);
  assert.equal(isHouseInteriorSleepPosition(effects, 0.54, 0.59, 2), true);
  assert.equal(isHouseInteriorSleepPosition(effects, 0.56, 0.5, 2), false);
  assert.equal(isHouseInteriorSleepPosition(effects, 0.5, 0.61, 2), false);

  assert.deepEqual(
    getHouseInteriorSleepSnapPosition(effects, 0.56, 0.5, 2),
    { effectId: "sleep-1", x: 0.5, y: 0.5 },
  );
  assert.equal(getHouseInteriorSleepSnapPosition(effects, 0.7, 0.5, 2), null);
});

test("Home pet size controls use a 100px-style base range of 50% through 110%", () => {
  const sizing = read("client/src/lib/petHouseSizing.ts");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.equal(PET_HOUSE_PLAYER_MIN_SCALE, 50);
  assert.equal(PET_HOUSE_PLAYER_MAX_SCALE, 110);
  assert.equal(clampPetHousePlayerScale(999), 110);
  assert.equal(clampPetHousePlayerScale(10), 50);
  assert.match(sizing, /PET_HOUSE_OUTDOOR_PET_BASE_SIZE = 100/);
  assert.match(sizing, /PET_HOUSE_INTERIOR_PET_BASE_SIZE = 100/);
  assert.match(owner, /Returning…/);
  assert.match(owner, /pending \? "Returning…" : "Return"/);
  assert.match(visitor, /clampPetHousePlayerScale\(pet\.homeScalePct \?\? 100\)/);
});

test("Sleep Square switches interior pets to sleep mode and shows Zzz for owners and visitors", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(effects, /label: "Sleep Square"/);
  assert.match(effects, /function SleepSquareVisual/);
  assert.match(effects, /function SleepSpotHintVisual/);
  assert.match(effects, /adminPreview \? <SleepSquareVisual \/> : <SleepSpotHintVisual \/>/);

  assert.match(owner, /getHouseInteriorSleepSnapPosition/);
  assert.match(owner, /sleepSnap\?\.x \?\? rawXPct/);
  assert.match(owner, /sleepSnap\?\.y \?\? rawYPct/);

  for (const source of [owner, visitor]) {
    assert.match(source, /isHouseInteriorSleepPosition/);
    assert.match(source, /PetSleepZzz/);
    assert.match(source, /data-sleeping=\{isSleeping \? "true" : undefined\}/);
    assert.match(source, /"sleep"/);
  }
});

test("players can locally toggle Campfire, Candle Light, and Lamp Glow without changing saved placement", () => {
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(effects, /type === "fire" \|\| type === "candle_light" \|\| type === "warm_glow"/);
  assert.match(effects, /offEffectIds/);
  assert.match(effects, /onToggleEffect/);
  assert.match(effects, /data-effect-off=\{isOff \? "true" : undefined\}/);
  assert.match(effects, /data-player-toggle-effect-id=\{playerToggleable \? effect\.id : undefined\}/);
  assert.doesNotMatch(effects, /onClick=\{playerToggleable/);
  assert.match(effects, /!isOff && <EffectVisual/);

  for (const source of [owner, visitor]) {
    assert.match(source, /setOffEffectIds/);
    assert.match(source, /onToggleEffect=\{toggleLightEffect\}/);
    assert.match(source, /offEffectIds=\{offEffectIds\}/);
    assert.match(source, /toggleEffectId/);
    assert.match(source, /Math\.hypot/);
    assert.match(source, /drag\.moved/);
  }
});

test("saved room darkness is the lights-off baseline and player light toggles brighten left/right sides", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /<HomeInteriorDarknessLayer[\s\S]*effects=\{effects\}[\s\S]*offEffectIds=\{offEffectIds\}[\s\S]*zIndex=\{2\}/);
    assert.match(source, /darkness=\{openInterior\.interiorDarkness\}/);
    assert.match(source, /interiorDarkness: b\.interiorDarkness \?\? 0/);
  }

  assert.match(effects, /getHouseInteriorSideDarkness/);
  assert.match(effects, /data-left-light-boost=\{sideLighting\.leftBoost\}/);
  assert.match(effects, /data-right-light-boost=\{sideLighting\.rightBoost\}/);
  assert.match(effects, /linear-gradient\(90deg/);

  // Admin preview intentionally remains the exact saved all-lights-off baseline.
  assert.match(admin, /<HomeInteriorDarknessLayer darkness=\{darkness\} zIndex=\{5\} \/>/);
});

test("owner and visitor building interiors render saved effects in image-space coordinates", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /HomeInteriorEffectsLayer/);
    assert.match(source, /interiorEffects: b\.interiorEffects \?\? \[\]/);
    assert.match(source, /effects=\{openInterior\.interiorEffects\}/);
  }
});

test("database schema and startup migration persist building interior effects", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");

  assert.match(schema, /interiorEffects: jsonb\("interior_effects"\)/);
  assert.match(schema, /interiorDarkness: integer\("interior_darkness"\)\.notNull\(\)\.default\(0\)/);
  assert.match(boot, /house_bundle_buildings ADD COLUMN IF NOT EXISTS interior_effects JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(boot, /house_bundle_buildings ADD COLUMN IF NOT EXISTS interior_darkness INTEGER NOT NULL DEFAULT 0/);
});
