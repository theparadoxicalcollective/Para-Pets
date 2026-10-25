import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOUSE_OUTDOOR_EFFECT_TYPES,
  sanitizeHouseOutdoorEffects,
} from "../shared/housing";
import {
  HOME_OUTDOOR_AUTO_TRANSITION_MS,
  HOME_OUTDOOR_NIGHT_DARKNESS,
  HOME_OUTDOOR_OVERRIDE_TRANSITION_MS,
  HOME_OUTDOOR_RESUME_TRANSITION_MS,
  cycleHomeOutdoorLightingMode,
  getAutomaticHomeNightStrength,
  getHomeOutdoorDarkness,
} from "../client/src/lib/homeOutdoorLighting";

const read = (path: string) => readFileSync(path, "utf8");
const at = (hour: number, minute = 0) => new Date(2026, 9, 3, hour, minute, 0);

test("automatic Home lighting eases through dawn and dusk using the player's local clock", () => {
  assert.equal(HOME_OUTDOOR_NIGHT_DARKNESS, 78);
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
  assert.equal(getHomeOutdoorDarkness("auto", at(18, 30)), HOME_OUTDOOR_NIGHT_DARKNESS * 0.25);
  assert.equal(HOME_OUTDOOR_AUTO_TRANSITION_MS, 1_200);
  assert.equal(HOME_OUTDOOR_OVERRIDE_TRANSITION_MS, 280);
  assert.equal(HOME_OUTDOOR_RESUME_TRANSITION_MS, 420);
});

test("day-night control cycles auto to sun, moon, and back to automatic", () => {
  assert.equal(cycleHomeOutdoorLightingMode("auto"), "day");
  assert.equal(cycleHomeOutdoorLightingMode("day"), "night");
  assert.equal(cycleHomeOutdoorLightingMode("night"), "auto");
});

test("outdoor Home effects include Sleep Square and clamp safely for use in the yard", () => {
  assert.deepEqual(HOUSE_OUTDOOR_EFFECT_TYPES, [
    "fire",
    "candle_light",
    "lamp_light",
    "warm_glow",
    "sparkles",
    "dust_motes",
    "soft_mist",
    "sleep",
  ]);
  assert.deepEqual(
    sanitizeHouseOutdoorEffects([
      { id: "fire", type: "fire", x: -1, y: 2, size: 99 },
      { id: "lamp", type: "lamp_light", x: 0.2, y: 0.3, size: 16 },
      { id: "sleep", type: "sleep", x: 0.5, y: 0.5, size: 18 },
      { id: "mist", type: "soft_mist", x: 0.4, y: 0.6, size: 20 },
    ]),
    [
      { id: "fire", type: "fire", x: 0, y: 1, size: 40 },
      { id: "lamp", type: "lamp_light", x: 0.2, y: 0.3, size: 16 },
      { id: "sleep", type: "sleep", x: 0.5, y: 0.5, size: 18 },
      { id: "mist", type: "soft_mist", x: 0.4, y: 0.6, size: 20 },
    ],
  );
});

test("owner and visitor Home yards use the owner's current day-night setting during the visit", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");

  assert.match(owner, /useState<HomeOutdoorLightingMode>\("auto"\)/);
  assert.match(owner, /useHomeOutdoorLighting\(currentOutdoorLightingMode\)/);
  assert.match(visitor, /useHomeOutdoorLighting\(activeBundle\?\.playerLighting\?\.outdoorMode \?\? "auto"\)/);

  for (const source of [owner, visitor]) {
    assert.match(source, /HomeOutdoorAtmosphereLayer/);
    assert.match(source, /effects=\{activeBundle\?\.exteriorEffects \?\? \[\]\}/);
    assert.match(source, /<HomeInteriorEffectsLayer[\s\S]*activeBundle\?\.exteriorEffects/);
  }

  assert.match(owner, /<HomeDayNightToggle/);
  assert.match(owner, /nightStrength=\{outdoorLighting\.nightStrength\}/);
  assert.match(owner, /onCycle=\{cycleOutdoorLighting\}/);
  assert.match(owner, /\/api\/house-bundles\/\$\{bundleId\}\/player-lighting/);
  assert.doesNotMatch(visitor, /<HomeDayNightToggle/);
  assert.doesNotMatch(visitor, /onCycle=/);

  assert.doesNotMatch(atmosphere, /localStorage/);
  assert.doesNotMatch(atmosphere, /HOME_OUTDOOR_LIGHTING_STORAGE_KEY/);
  assert.match(atmosphere, /document\.addEventListener\("visibilitychange", syncFromLifecycle\)/);
  assert.match(atmosphere, /window\.addEventListener\("pageshow", syncFromLifecycle\)/);
  assert.match(atmosphere, /document\.visibilityState === "hidden"/);
  assert.match(atmosphere, /HOME_OUTDOOR_RESUME_TRANSITION_MS/);
  assert.match(atmosphere, /window\.setInterval\(\(\) => \{[\s\S]*?HOME_OUTDOOR_AUTO_TRANSITION_MS[\s\S]*?\}, 30_000\)/);
  assert.match(atmosphere, /data-lighting-mode=\{mode\}/);
  assert.match(atmosphere, /data-testid="home-day-night-planet"/);
  assert.match(atmosphere, /safeNight \* 100/);
  assert.match(atmosphere, /HOME_OUTDOOR_AUTO_TRANSITION_MS/);
  assert.match(atmosphere, /HOME_OUTDOOR_OVERRIDE_TRANSITION_MS/);
  assert.match(atmosphere, /transitionMs = mode === "auto"/);
  assert.match(atmosphere, /transition: `opacity \$\{transitionMs\}ms linear`/);
  assert.match(atmosphere, /transition: `fill-opacity \$\{transitionMs\}ms linear`/);
  assert.match(atmosphere, /<Sun /);
  assert.match(atmosphere, /<Moon /);
  assert.doesNotMatch(atmosphere, /function AutoLightingIcon/);
  assert.doesNotMatch(atmosphere, /☀️|🌙/);
});


test("outdoor night keeps one stable masked darkness renderer while decorative light effects remain above it", () => {
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(atmosphere, /data-testid="home-outdoor-night-tint"/);
  assert.equal((atmosphere.match(/data-testid="home-outdoor-darkness-layer"/g) ?? []).length, 1);
  assert.match(atmosphere, /<svg/);
  assert.match(atmosphere, /<mask/);
  assert.match(atmosphere, /maskType: "luminance"/);
  assert.match(atmosphere, /fillOpacity: safeDarkness \/ 100/);
  assert.match(atmosphere, /contain: "paint"/);
  assert.doesNotMatch(atmosphere, /HomeInteriorDarknessLayer/);
  assert.doesNotMatch(atmosphere, /mixBlendMode: "screen"/);
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


test("manual Day/Night overrides reset to Auto whenever the owner leaves the Pet Home", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /outdoorLightingSessionRef/);
  assert.match(owner, /setCurrentOutdoorLightingMode\(nextMode\)/);
  assert.match(owner, /if \(session\.touched \|\| persistedMode === "auto"\) return/);
  assert.match(owner, /resetOutdoorLightingOnDeparture/);
  assert.match(owner, /return \(\) => resetOutdoorLightingOnDeparture\(\)/);
  assert.match(owner, /outdoorMode: "auto"/);
  assert.match(owner, /keepalive: true/);
  assert.match(owner, /session\.touched = false/);
  assert.match(owner, /outdoorLightingSessionRef\.current\.touched = true/);
  assert.match(owner, /session\.touched \|\| persistedMode === "auto"/);
  assert.match(owner, /persistPlayerLightingPatch\(activeBundle\.id, \{ outdoorMode: "auto" \}\)/);
  assert.match(owner, /body: JSON\.stringify\(\{ outdoorMode: "auto" \}\)/);
  assert.match(owner, /lightingSaveQueueRef\.current = lightingSaveQueueRef\.current/);
});

test("player Home lighting is stored per owned bundle instead of globally in the browser", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const storage = read("server/storage.ts");
  const routes = read("server/routes/houseBundle.routes.ts");
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(schema, /outdoorLightingMode: text\("outdoor_lighting_mode"\)\.notNull\(\)\.default\("auto"\)/);
  assert.match(schema, /offInteriorEffectIds: jsonb\("off_interior_effect_ids"\)/);
  assert.match(boot, /user_house_bundles ADD COLUMN IF NOT EXISTS outdoor_lighting_mode TEXT NOT NULL DEFAULT 'auto'/);
  assert.match(boot, /user_house_bundles ADD COLUMN IF NOT EXISTS off_interior_effect_ids JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(storage, /playerLighting:/);
  assert.match(storage, /updateUserHouseLighting/);
  assert.match(routes, /PATCH|patch/i);
  assert.match(routes, /\/api\/house-bundles\/:bundleId\/player-lighting/);
  assert.match(owner, /lightingSaveQueueRef/);
  assert.match(owner, /toggleSavedInteriorLight/);
  assert.match(owner, /cycleOutdoorLighting/);
});


test("automatic darkness uses short stable fades between clock samples", () => {
  const lighting = read("client/src/lib/homeOutdoorLighting.ts");
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");

  assert.doesNotMatch(lighting, /Math\.round\(getHomeOutdoorNightStrength/);
  assert.equal(HOME_OUTDOOR_AUTO_TRANSITION_MS, 1_200);
  assert.match(atmosphere, /transition: \`fill-opacity \$\{transitionMs\}ms linear\`/);
  assert.match(atmosphere, /transition: \`opacity \$\{transitionMs\}ms linear\`/);
});

test("full nighttime uses a darker maximum and stronger tint than the original implementation", () => {
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  assert.equal(HOME_OUTDOOR_NIGHT_DARKNESS, 78);
  assert.match(atmosphere, /opacity: safeNight \* \.30/);
  assert.match(atmosphere, /rgba\(1,5,15,\.78\)/);
});


test("day-night rendering stays mounted at zero darkness so manual overrides can fade instead of flash", () => {
  const darknessLayer = read("client/src/components/HomeInteriorEffect.tsx");
  assert.doesNotMatch(darknessLayer, /if \(safeDarkness <= 0\) return null/);
  assert.match(darknessLayer, /background: \`rgba\(0,0,0,\$\{safeDarkness \/ 100\}\)\`/);
  assert.match(darknessLayer, /fillOpacity: safeDarkness \/ 100/);
});

test("outdoor sunlight visuals follow daylight strength for owners and visitors", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  assert.match(owner, /sunlightStrength=\{tutorialSceneRevealActive \? 1 : outdoorLighting\.daylightStrength\}/);
  assert.match(visitor, /sunlightStrength=\{outdoorLighting\.daylightStrength\}/);
});



test("full automatic night keeps the same SVG renderer before and after Home dimensions load", () => {
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  assert.match(atmosphere, /const hasSceneBox =/);
  assert.match(atmosphere, /const maskWidth = hasSceneBox \? imgWidth : 1/);
  assert.match(atmosphere, /const maskHeight = hasSceneBox \? sceneHeight : 1/);
  assert.equal((atmosphere.match(/data-testid="home-outdoor-darkness-layer"/g) ?? []).length, 1);
  assert.equal((atmosphere.match(/<svg/g) ?? []).length, 1);
  assert.doesNotMatch(atmosphere, /activeLights\.length === 0/);
  assert.doesNotMatch(atmosphere, /useImageSpace/);
});


test("outdoor lamps reveal the real night scene through soft darkness cutouts", () => {
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");

  assert.match(atmosphere, /effects\.filter\(effect => isHouseInteriorLightEffectType\(effect\.type\)\)/);
  assert.match(atmosphere, /getHouseInteriorLightRadiusRatio\(effect\)/);
  assert.match(atmosphere, /getHouseInteriorLightCutoutStrength\(effect\.type\)/);
  assert.match(atmosphere, /<radialGradient/);
  assert.match(atmosphere, /<circle/);
  assert.match(atmosphere, /mask=\{\`url\(#\$\{maskId\}\)\`\}/);
  assert.match(atmosphere, /effect\.type === "warm_glow"[\s\S]*\(1 - safeNight\)/);
  assert.doesNotMatch(atmosphere, /home-outdoor-light-reveal-/);
  assert.doesNotMatch(atmosphere, /mixBlendMode: "screen"/);
});

