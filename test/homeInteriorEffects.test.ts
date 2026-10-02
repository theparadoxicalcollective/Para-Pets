import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOUSE_INTERIOR_EFFECT_MAX_COUNT,
  HOUSE_INTERIOR_EFFECT_TYPES,
  isHouseInteriorSleepPosition,
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

test("Sleep Square hit testing matches its scene-height square footprint", () => {
  const effects = [
    { id: "sleep-1", type: "sleep" as const, x: 0.5, y: 0.5, size: 20 },
  ];

  assert.equal(isHouseInteriorSleepPosition(effects, 0.5, 0.5, 2), true);
  assert.equal(isHouseInteriorSleepPosition(effects, 0.54, 0.59, 2), true);
  assert.equal(isHouseInteriorSleepPosition(effects, 0.56, 0.5, 2), false);
  assert.equal(isHouseInteriorSleepPosition(effects, 0.5, 0.61, 2), false);
});

test("Sleep Square switches interior pets to sleep mode and shows Zzz for owners and visitors", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(effects, /label: "Sleep Square"/);
  assert.match(effects, /function SleepSquareVisual/);

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
  assert.match(effects, /!isOff && <EffectVisual/);

  for (const source of [owner, visitor]) {
    assert.match(source, /setOffEffectIds/);
    assert.match(source, /onToggleEffect=\{toggleLightEffect\}/);
    assert.match(source, /offEffectIds=\{offEffectIds\}/);
  }
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
  assert.match(boot, /house_bundle_buildings ADD COLUMN IF NOT EXISTS interior_effects JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
});
