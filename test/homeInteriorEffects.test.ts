import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { broadenHomeBundleLampIllumination, HOME_BUNDLE_LAMP_ILLUMINATION_SCALE } from "../client/src/lib/homeBundleLighting";
import { broadenHomeAttachedLampIllumination } from "../client/src/lib/homeItemEffects";
import {
  HOUSE_INTERIOR_DARKNESS_MAX,
  HOUSE_INTERIOR_EFFECT_MAX_COUNT,
  HOUSE_INTERIOR_EFFECT_TYPES,
  HOUSE_INTERIOR_LIGHT_MAX_LOCAL_BOOST,
  HOUSE_INTERIOR_SLEEP_PET_Y_OFFSET_RATIO,
  PET_HOUSE_PLAYER_MAX_SCALE,
  PET_HOUSE_PLAYER_MIN_SCALE,
  clampPetHousePlayerScale,
  getHouseInteriorLightCutoutStrength,
  getHouseInteriorLightPeakBoost,
  getHouseInteriorLightRadiusRatio,
  getHouseInteriorLocalLightBoost,
  getHouseInteriorPointDarkness,
  getHouseInteriorSleepSnapPosition,
  isHouseInteriorPointOverActiveFire,
  isHouseInteriorSleepPosition,
  sanitizeHouseInteriorDarkness,
  sanitizeHouseInteriorEffects,
} from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

test("home interior effect catalog includes the requested scene-enhancing effects", () => {
  assert.deepEqual(HOUSE_INTERIOR_EFFECT_TYPES, [
    "fire",
    "candle_light",
    "lamp_light",
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

test("room darkness stays the lights-off baseline while active lights brighten local circular areas", () => {
  const lights = [
    { id: "left-fire", type: "fire" as const, x: 0.2, y: 0.5, size: 14 },
    { id: "right-lamp", type: "warm_glow" as const, x: 0.8, y: 0.5, size: 18 },
    { id: "center-candle", type: "candle_light" as const, x: 0.5, y: 0.5, size: 10 },
  ];
  const allOff = new Set(lights.map(light => light.id));

  assert.equal(getHouseInteriorLocalLightBoost(lights, allOff, 0.2, 0.5, 2), 0);
  assert.equal(getHouseInteriorPointDarkness(60, lights, allOff, 0.2, 0.5, 2), 60);

  const fireOnlyOff = new Set(["right-lamp", "center-candle"]);
  assert.equal(getHouseInteriorLocalLightBoost(lights, fireOnlyOff, 0.2, 0.5, 2), getHouseInteriorLightPeakBoost("fire"));
  assert.equal(
    getHouseInteriorPointDarkness(60, lights, fireOnlyOff, 0.2, 0.5, 2),
    60 * (1 - getHouseInteriorLightCutoutStrength("fire")),
  );
  assert.equal(getHouseInteriorPointDarkness(60, lights, fireOnlyOff, 0.8, 0.5, 2), 60);

  const fireRadius = getHouseInteriorLightRadiusRatio(lights[0]);
  assert.equal(fireRadius > lights[0].size / 100, true);
  assert.equal(getHouseInteriorLocalLightBoost(lights, fireOnlyOff, 0.2 + fireRadius / 2 / 2, 0.5, 2) > 0, true);
  assert.equal(getHouseInteriorLocalLightBoost(lights, fireOnlyOff, 0.2 + fireRadius / 2 + 0.01, 0.5, 2), 0);

  const stackedLights = Array.from({ length: 10 }, (_, index) => ({
    id: `light-${index}`,
    type: "fire" as const,
    x: 0.5,
    y: 0.5,
    size: 14,
  }));
  assert.equal(getHouseInteriorLocalLightBoost(stackedLights, new Set(), 0.5, 0.5, 2), HOUSE_INTERIOR_LIGHT_MAX_LOCAL_BOOST);
});

test("Sunlight strength follows daylight without changing other saved light types", () => {
  const sunlight = [{ id: "window", type: "warm_glow" as const, x: 0.5, y: 0.5, size: 18 }];
  const peak = getHouseInteriorLightPeakBoost("warm_glow");

  assert.equal(getHouseInteriorLocalLightBoost(sunlight, new Set(), 0.5, 0.5, 2, 1), peak);
  assert.equal(getHouseInteriorLocalLightBoost(sunlight, new Set(), 0.5, 0.5, 2, 0.5), peak * 0.5);
  assert.equal(getHouseInteriorLocalLightBoost(sunlight, new Set(), 0.5, 0.5, 2, 0), 0);
  assert.equal(getHouseInteriorPointDarkness(70, sunlight, new Set(), 0.5, 0.5, 2, 0), 70);
});

test("interior lights keep lamp focused but brighter at the center while Sunlight reaches farther", () => {
  const fire = { id: "fire", type: "fire" as const, x: 0.5, y: 0.5, size: 14 };
  const candle = { id: "candle", type: "candle_light" as const, x: 0.5, y: 0.5, size: 10 };
  const lamp = { id: "lamp", type: "lamp_light" as const, x: 0.5, y: 0.5, size: 16 };
  const sunlight = { id: "sunlight", type: "warm_glow" as const, x: 0.5, y: 0.5, size: 18 };

  assert.equal(getHouseInteriorLightRadiusRatio(candle), 0.1 * 1.45);
  assert.equal(getHouseInteriorLightRadiusRatio(lamp), 0.16 * 2.2);
  assert.equal(getHouseInteriorLightRadiusRatio(sunlight), 0.18 * 2.5);
  assert.equal(getHouseInteriorLightRadiusRatio(fire), 0.14 * 3.5);

  assert.equal(getHouseInteriorLightPeakBoost("candle_light"), 18);
  assert.equal(getHouseInteriorLightPeakBoost("lamp_light"), 38);
  assert.equal(getHouseInteriorLightPeakBoost("warm_glow"), 34);
  assert.equal(getHouseInteriorLightPeakBoost("fire"), 42);

  assert.ok(getHouseInteriorLightCutoutStrength("candle_light") < getHouseInteriorLightCutoutStrength("lamp_light"));
  assert.ok(getHouseInteriorLightCutoutStrength("lamp_light") > getHouseInteriorLightCutoutStrength("warm_glow"));
  assert.ok(getHouseInteriorLightCutoutStrength("warm_glow") < getHouseInteriorLightCutoutStrength("fire"));
  assert.ok(getHouseInteriorLightCutoutStrength("fire") < 1);
});

test("Home Bundle Lamp Light reveals nearly a campfire-sized radius without changing attached Decor/Object lamps", () => {
  const bundleLamp = { id: "bundle-lamp", type: "lamp_light" as const, x: 0.5, y: 0.5, size: 16 };
  const bundleFire = { id: "bundle-fire", type: "fire" as const, x: 0.5, y: 0.5, size: 16 };
  const [bundleLampIllumination, unchangedFire] = broadenHomeBundleLampIllumination([bundleLamp, bundleFire]);
  const [attachedLampIllumination] = broadenHomeAttachedLampIllumination([bundleLamp]);

  assert.equal(HOME_BUNDLE_LAMP_ILLUMINATION_SCALE, 1.5);
  assert.equal(bundleLamp.size, 16);
  assert.equal(bundleLampIllumination.size, 24);
  assert.deepEqual(unchangedFire, bundleFire);
  assert.ok(bundleLampIllumination.size > attachedLampIllumination.size);

  const bundleLampRadius = getHouseInteriorLightRadiusRatio(bundleLampIllumination);
  const sameSizeFireRadius = getHouseInteriorLightRadiusRatio(bundleFire);
  assert.ok(bundleLampRadius < sameSizeFireRadius);
  assert.ok(bundleLampRadius > sameSizeFireRadius * 0.9);

  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  for (const source of [owner, visitor]) {
    assert.match(source, /broadenHomeBundleLampIllumination\(effects\)/);
    assert.match(source, /broadenHomeBundleLampIllumination\(activeBundle\?\.exteriorEffects \?\? \[\]\)/);
    assert.match(source, /bundleLampIlluminationEffects/);
    assert.match(source, /bundleOutdoorIlluminationEffects/);
    assert.match(source, /effects=\{effects\}/);
    assert.match(source, /effects=\{activeBundle\?\.exteriorEffects \?\? \[\]\}/);
  }
});

test("interior pets use the same local light falloff as the room", () => {
  const lights = [
    { id: "fire", type: "fire" as const, x: 0.25, y: 0.55, size: 14 },
  ];
  const allOff = new Set(["fire"]);

  assert.equal(getHouseInteriorPointDarkness(70, lights, allOff, 0.25, 0.55, 2), 70);
  assert.equal(
    getHouseInteriorPointDarkness(70, lights, new Set(), 0.25, 0.55, 2),
    70 * (1 - getHouseInteriorLightCutoutStrength("fire")),
  );
  assert.equal(getHouseInteriorPointDarkness(70, lights, new Set(), 0.9, 0.55, 2), 70);

  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  for (const source of [owner, visitor]) {
    assert.match(source, /getHouseInteriorPointDarkness\([\s\S]{0,180}imageAspect[\s\S]{0,80}sunlightStrength/);
    assert.match(source, /const petBrightness = \(100 - petDarkness\) \/ 100/);
    assert.match(source, /brightness\(\$\{petBrightness\}\)/);
  }
});

test("dragged outdoor pets stay beneath the atmosphere layer so darkness and lamp cutouts continue to affect them", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /const isDraggingThis = petDragLive\?\.inventoryId === pet\.inventoryId/);
  assert.match(owner, /const xPct = isDraggingThis \? petDragLive\.xPct/);
  assert.match(owner, /const yPct = isDraggingThis \? petDragLive\.yPct/);
  assert.match(owner, /zIndex: isSelectedPet \|\| isDraggingThis \? 19/);
  assert.match(owner, /<HomeOutdoorAtmosphereLayer[\s\S]{0,420}zIndex=\{20\}/);
  assert.match(owner, /<HomeInteriorEffectsLayer[\s\S]{0,260}effects=\{outdoorLampEffects\}[\s\S]{0,260}zIndex=\{24\}/);

  // Visitors do not drag pets; their pet layer already stays below the same atmosphere.
  assert.match(visitor, /data-testid=\{`visit-pet-outdoor-\$\{pet\.inventoryId\}`\}[\s\S]{0,220}zIndex: 5/);
  assert.match(visitor, /<HomeOutdoorAtmosphereLayer[\s\S]{0,420}zIndex=\{20\}/);
});

test("interior decor and objects use the same local room darkness as pets", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const asset = read("client/src/components/HomeSceneAssetImage.tsx");

  assert.match(owner, /const itemDarkness = getHouseInteriorPointDarkness\([\s\S]*item\.xPct,[\s\S]*item\.yPct,[\s\S]*imageAspect/);
  assert.match(owner, /const itemBrightness = \(100 - itemDarkness\) \/ 100/);
  assert.match(owner, /brightness=\{itemBrightness\}/);

  assert.match(visitor, /const itemDarkness = getHouseInteriorPointDarkness\([\s\S]*item\.xPct,[\s\S]*item\.yPct,[\s\S]*imageAspect/);
  assert.match(visitor, /const itemBrightness = \(100 - itemDarkness\) \/ 100/);
  assert.match(visitor, /brightness\(\$\{itemBrightness\}\)/);

  assert.match(asset, /brightness\?: number/);
  assert.match(asset, /brightness = 1/);
  assert.match(asset, /brightness\(\$\{brightness\}\)/);
  assert.match(asset, /transition: "filter 260ms ease-out"/);
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
  assert.match(source, /<HomeInteriorDarknessLayer[\s\S]{0,240}darkness=\{darkness\}/);
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

test("player building exits use a world-style sparkle while Admin keeps the movable Outside marker", () => {
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");

  assert.match(effects, /function HomeInteriorExitSparkle/);
  assert.match(effects, /para-home-exit-sparkle-pulse/);
  assert.match(effects, /para-home-exit-sparkle-twinkle/);
  assert.match(effects, /const sparkleSize = 28/);
  assert.match(effects, /HOME_INTERIOR_EXIT_SPARKS/);
  assert.doesNotMatch(effects, /para-home-exit-sparkle-core/);

  for (const source of [owner, visitor]) {
    assert.match(source, /HomeInteriorExitSparkle/);
    assert.match(source, /data-testid="button-interior-exit-sparkle"/);
    assert.match(source, /aria-label="Outside"/);
    assert.match(source, /background: "transparent"/);
    assert.match(source, /<HomeInteriorExitSparkle \/>/);
  }

  assert.match(admin, /data-testid="button-leave-draggable"[\s\S]{0,1600}>\s*Outside\s*<\/button>/);
});

test("player and visitor interiors fade Sunlight with the outside day-night cycle while keeping it tappable", () => {
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(effects, /sunlightStrength = 1/);
  assert.match(effects, /effect\.type === "warm_glow" \? safeSunlight : 1/);
  assert.match(effects, /daylightOpacity = effect\.type === "warm_glow"/);
  assert.match(effects, /const hitSizePx = playerToggleable \? Math\.max\(48, sizePx\) : sizePx/);
  assert.match(effects, /data-sunlight-synced-toggle=/);
  assert.match(effects, /width: hitSizePx/);
  assert.match(effects, /height: hitSizePx/);
  assert.match(effects, /opacity: daylightOpacity/);
  assert.match(effects, /pointerEvents: "none"/);
  for (const source of [owner, visitor]) {
    assert.match(source, /sunlightStrength=\{outdoorLighting\.daylightStrength\}/);
    assert.match(source, /data-player-toggle-effect-id/);
    assert.match(source, /toggleEffectId/);
  }
});

test("campfire, candle, lamp, and sunlight remain distinct renderers", () => {
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
  assert.match(source, /label: "Lamp Light"/);
  assert.match(source, /function LampLightVisual/);
  assert.match(source, /data-testid="home-lamp-light-visual"/);
  assert.match(source, /data-testid="home-lamp-light-diffusion"/);
  assert.match(source, /data-testid="home-lamp-light-halo"/);
  assert.match(source, /radial-gradient\(circle at 50% 50%/);
  assert.match(source, /width: "16%"/);
  assert.match(source, /height: "16%"/);
  assert.match(source, /inset: "-38%"/);
  assert.match(source, /borderRadius: "50%"/);
  assert.match(source, /filter: "blur\(6px\)"/);
  assert.match(source, /data-testid="home-lamp-light-core"/);
  assert.match(source, /left: "50%"/);
  assert.match(source, /top: "50%"/);
  assert.match(source, /width: "16%"/);
  assert.match(source, /height: "16%"/);
  assert.match(source, /filter: "blur\(2px\)"/);
  assert.match(source, /label: "Sunlight"/);
  assert.match(source, /Soft broad daylight for windows/);
  assert.match(source, /function WarmGlowVisual/);
  assert.match(source, /type === "fire"\) return <CampfireVisual/);
  assert.match(source, /type === "candle_light"\) return <CandleLightVisual/);
  assert.match(source, /type === "lamp_light"\) return <LampLightVisual/);
  assert.match(source, /type === "warm_glow"\) return <WarmGlowVisual/);
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
    getHouseInteriorSleepSnapPosition(effects, 0.54, 0.5, 2),
    { effectId: "sleep-1", x: 0.5, y: 0.5 },
  );
  assert.equal(getHouseInteriorSleepSnapPosition(effects, 0.56, 0.5, 2), null);
  assert.equal(getHouseInteriorSleepSnapPosition(effects, 0.5, 0.61, 2), null);
  assert.equal(getHouseInteriorSleepSnapPosition(effects, 0.7, 0.5, 2), null);
});

test("Home pet size controls keep a 100px start and allow growth through 250px", () => {
  const sizing = read("client/src/lib/petHouseSizing.ts");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.equal(PET_HOUSE_PLAYER_MIN_SCALE, 50);
  assert.equal(PET_HOUSE_PLAYER_MAX_SCALE, 250);
  assert.equal(clampPetHousePlayerScale(999), 250);
  assert.equal(clampPetHousePlayerScale(10), 50);
  assert.match(sizing, /PET_HOUSE_OUTDOOR_PET_BASE_SIZE = 100/);
  assert.match(sizing, /PET_HOUSE_INTERIOR_PET_BASE_SIZE = 100/);
  assert.match(owner, /data-testid=\{`home-pet-visible-scale-\$\{pet\.inventoryId\}`\}/);
  assert.match(owner, /transform: \`scale\(\$\{petScale\}\)\`/);
  assert.match(owner, /width: PET_HOUSE_INTERIOR_PET_BASE_SIZE/);
  assert.match(visitor, /data-testid=\{`visit-pet-visible-scale-\$\{pet\.inventoryId\}`\}/);
  assert.match(visitor, /transform: \`scale\(\$\{petScale\}\)\`/);
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
  assert.doesNotMatch(owner, /visiblePetSize \/ 2 \/ imgWidthRef\.current/);
  assert.doesNotMatch(owner, /visiblePetSize \/ 2 \/ Math\.max\(containerHRef\.current, 1\)/);
  assert.match(owner, /sleepSnap\?\.x \?\? rawXPct/);
  assert.match(owner, /HOUSE_INTERIOR_SLEEP_PET_Y_OFFSET_RATIO/);
  assert.match(owner, /sleepSnap\.y - sleepYOffsetPct/);
  assert.equal(HOUSE_INTERIOR_SLEEP_PET_Y_OFFSET_RATIO, 0.08);

  for (const source of [owner, visitor]) {
    assert.match(source, /isHouseInteriorSleepPosition/);
    assert.match(source, /PetSleepZzz/);
    assert.match(source, /data-sleeping=\{isSleeping \? "true" : undefined\}/);
    assert.match(source, /"sleep"/);
  }
});

test("active fire gives pets the closed-eye X-eyes Easter egg and delayed smoke", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const reaction = read("client/src/components/PetFireReaction.tsx");

  const fire = [{ id: "fire-1", type: "fire" as const, x: 0.5, y: 0.5, size: 14 }];
  assert.equal(isHouseInteriorPointOverActiveFire(fire, new Set(), 0.5, 0.5, 2), true);
  assert.equal(isHouseInteriorPointOverActiveFire(fire, new Set(["fire-1"]), 0.5, 0.5, 2), false);
  assert.equal(isHouseInteriorPointOverActiveFire(fire, new Set(), 0.8, 0.5, 2), false);

  for (const source of [owner, visitor]) {
    assert.match(source, /isHouseInteriorPointOverActiveFire/);
    assert.match(source, /isOnFire \? "sleep"/);
    assert.match(source, /isOnFire && <PetFireReaction hideEyes=\{!!pet\.petTemplateId\} \/>/);
    assert.match(source, /fireReaction=\{isOnFire\}/);
  }

  assert.match(reaction, /<span>×<\/span>/);
  assert.match(reaction, /top: "39%"/);
  assert.match(reaction, /fontSize: 20/);
  assert.match(reaction, /WebkitTextStroke: "1\.2px #b80f0b"/);
  assert.match(reaction, /delay: "2\.2s"/);
  assert.match(reaction, /para-pet-fire-smoke/);
});

test("owner light toggles persist while visitor light toggles stay session-only", () => {
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(effects, /return isHouseInteriorLightEffectType\(type\)/);
  assert.match(effects, /offEffectIds/);
  assert.match(effects, /onToggleEffect/);
  assert.match(effects, /data-effect-off=\{isOff \? "true" : undefined\}/);
  assert.match(effects, /data-player-toggle-effect-id=\{playerToggleable \? effect\.id : undefined\}/);
  assert.doesNotMatch(effects, /onClick=\{playerToggleable/);
  assert.match(effects, /!isOff && \(/);
  assert.match(effects, /<EffectVisual type=\{effect\.type\} adminPreview=\{interactive\} \/>/);

  assert.match(owner, /toggleSavedInteriorLight/);
  assert.match(owner, /offInteriorEffectIds/);
  assert.match(owner, /onToggleLightEffect=\{\(effect\) => toggleSavedInteriorLight\(openInterior\.buildingId, effect\)\}/);
  assert.match(owner, /onToggleEffect=\{onToggleLightEffect\}/);
  assert.match(owner, /toggleEffectId/);
  assert.match(owner, /Math\.hypot/);
  assert.match(owner, /drag\.moved/);

  assert.match(visitor, /visitorInteriorLightOff/);
  assert.match(visitor, /toggleVisitorInteriorLight/);
  assert.match(visitor, /onToggleEffect=\{onToggleLightEffect\}/);
  assert.match(visitor, /data-player-toggle-effect-id/);
  assert.match(visitor, /Math\.hypot/);
  assert.match(visitor, /drag\.moved/);
  assert.match(visitor, /onToggleLightEffect=\{\(effect\) => toggleVisitorInteriorLight\(openInterior\.buildingId, effect\)\}/);
  assert.match(visitor, /delete next\[buildingId\]/);
  assert.doesNotMatch(visitor, /\/player-lighting/);
});

test("saved room darkness is cut away locally around active lights without adding a colored light wash", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /<HomeInteriorDarknessLayer[\s\S]*effects=\{roomLightEffects\}[\s\S]*offEffectIds=\{offEffectIds\}[\s\S]*panX=\{panX\}[\s\S]*imgWidth=\{imgWidth\}[\s\S]*sceneHeight=\{containerH\}[\s\S]*zIndex=\{2\}/);
    assert.match(source, /darkness=\{openInterior\.interiorDarkness\}/);
  }

  assert.match(effects, /<mask[\s\S]*maskType: "luminance"/);
  assert.match(effects, /<radialGradient/);
  assert.match(effects, /getHouseInteriorLightCutoutStrength/);
  assert.match(effects, /fillOpacity: safeDarkness \/ 100/);
  assert.match(effects, /mask=\{\`url\(#\$\{maskId\}\)\`\}/);
  assert.doesNotMatch(effects, /home-interior-light-wash-/);
  assert.doesNotMatch(effects, /const glow = effect\.type/);

  // The legacy Warm Glow visual is preserved exactly and is now presented as Sunlight.
  assert.match(effects, /rgba\(255,232,128,0\.42\)/);
  assert.match(effects, /rgba\(255,202,70,0\.24\)/);
  assert.match(effects, /opacity: 0\.72/);

  // Admin preview uses the same local light cutouts as the player-facing room.
  assert.match(admin, /<HomeInteriorDarknessLayer[\s\S]*darkness=\{darkness\}[\s\S]*effects=\{effects\}[\s\S]*panX=\{panX\}[\s\S]*imgWidth=\{imgWidth\}[\s\S]*sceneHeight=\{containerHRef\.current\}[\s\S]*zIndex=\{5\}/);
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


test("legacy warm_glow saves stay valid as Sunlight while new lamp_light saves validate independently", () => {
  assert.deepEqual(
    sanitizeHouseInteriorEffects([
      { id: "legacy-window", type: "warm_glow", x: 0.4, y: 0.4, size: 18 },
      { id: "lamp", type: "lamp_light", x: 0.6, y: 0.6, size: 16 },
    ]),
    [
      { id: "legacy-window", type: "warm_glow", x: 0.4, y: 0.4, size: 18 },
      { id: "lamp", type: "lamp_light", x: 0.6, y: 0.6, size: 16 },
    ],
  );
});
