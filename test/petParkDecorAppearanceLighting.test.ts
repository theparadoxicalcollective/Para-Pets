import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PARK_DECOR_EFFECT_MAX_COUNT, isValidParkDecorEffects,
  parkDecorEffectWorldPosition,
} from "../shared/petParkDecorEffects";
import { parkOutdoorLightEffects } from "../shared/petParkAtmosphere";
import { getAutomaticHomeNightStrength } from "../client/src/lib/homeOutdoorLighting";
import { isPlayerToggleableInteriorEffect } from "../client/src/components/HomeInteriorEffect";
import { getHouseInteriorLocalLightBoost } from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");
const at = (h: number, m = 0) => new Date(2026, 10, 7, h, m);

test("Sunlight always follows automatic day/night and is never a player-tappable lamp", () => {
  assert.equal(isPlayerToggleableInteriorEffect("warm_glow"), false);
  assert.equal(isPlayerToggleableInteriorEffect("lamp_light"), true);
  assert.equal(isPlayerToggleableInteriorEffect("candle_light"), true);
  assert.equal(getAutomaticHomeNightStrength(at(5)), 1);
  assert.equal(getAutomaticHomeNightStrength(at(12)), 0);
  assert.equal(getAutomaticHomeNightStrength(at(19)), 0.5);
  const light = [{ id: "sun", type: "warm_glow" as const, x: 0.5, y: 0.5, size: 18 }];
  assert.ok(getHouseInteriorLocalLightBoost(light, new Set(["sun"]), 0.5, 0.5, 1, 1) > 0,
    "legacy saved off-state for sunlight cannot suppress daylight");
  assert.equal(getHouseInteriorLocalLightBoost(light, new Set(["sun"]), 0.5, 0.5, 1, 0), 0,
    "sunlight dims completely at night");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");
  assert.match(effects, /type !== "warm_glow" && isHouseInteriorLightEffectType/);
  assert.match(effects, /pointerEvents: interactive \|\| playerToggleable \? "auto" : "none"/);
  assert.match(read("client/src/pages/PetHousePage.tsx"), /effect\.type === "warm_glow"\) return/);
  assert.match(read("client/src/pages/VisitPetHousePage.tsx"), /effect\.type === "warm_glow"\) return/);
});

test("decor effects are bounded and validated before server persistence", () => {
  const one = { id: "f1", type: "warm_glow", x: 0.25, y: 0.65, size: 38 };
  assert.equal(isValidParkDecorEffects([one]), true);
  assert.equal(isValidParkDecorEffects([]), true);
  assert.equal(isValidParkDecorEffects(Array.from({ length: PARK_DECOR_EFFECT_MAX_COUNT + 1 }, (_, i) => ({
    ...one, id: "f" + i,
  }))), false);
  for (const altered of [
    { ...one, type: "unknown" }, { ...one, x: -1 }, { ...one, y: 2 },
    { ...one, size: 0 }, { ...one, size: 1000 }, { ...one, x: Infinity },
  ]) assert.equal(isValidParkDecorEffects([altered]), false);
  assert.equal(isValidParkDecorEffects([one, one]), false,
    "effect ids must be distinct within one decor");
});

test("duplicated decor share relative effect appearance but retain independent placement and flip", () => {
  const effect = { id: "sun", type: "warm_glow" as const, x: 0.3, y: 0.7, size: 50 };
  const scene = { width: 1200, height: 1600, scale: 0.8 };
  const a = { xPct: 0.2, yPct: 0.4, size: 240, flipped: false };
  const b = { xPct: 0.8, yPct: 0.7, size: 160, flipped: true };
  const aPosition = parkDecorEffectWorldPosition(a, effect, scene);
  const bPosition = parkDecorEffectWorldPosition(b, effect, scene);
  assert.ok(aPosition.x < 0.2 && aPosition.y > 0.4);
  assert.ok(bPosition.x > 0.8 && bPosition.y > 0.7,
    "flipped copy mirrors relative effect position without moving the copy");
  assert.notEqual(aPosition.size, bPosition.size);
  assert.deepEqual(a, { xPct: 0.2, yPct: 0.4, size: 240, flipped: false });
  assert.deepEqual(b, { xPct: 0.8, yPct: 0.7, size: 160, flipped: true });
  const lights = parkOutdoorLightEffects([
    { id: "a", kind: "decor", ...a, decorEffects: [effect] },
    { id: "b", kind: "decor", ...b, decorEffects: [effect] },
    { id: "standalone", kind: "effect", xPct: 0.5, yPct: 0.5, size: 140, flipped: false,
      effectType: "lamp_light" },
  ], scene, { x: 0, y: 0 }, { width: 1200, height: 1600 });
  assert.deepEqual(lights.map(l => l.id), ["a-sun", "b-sun", "standalone"]);
  assert.equal(lights[0].type, "warm_glow");
  assert.equal(lights[2].type, "lamp_light");
});

test("decor appearance group persists and propagates only appearance fields, never placement", () => {
  const route = read("server/routes/petParkAdmin.routes.ts");
  const migration = read("server/startup/migrations/ensurePetParkStorage.ts");
  const schema = read("shared/schema.ts");
  assert.match(schema, /appearanceGroupId: varchar\("appearance_group_id"\)/);
  assert.match(schema, /decorEffects: jsonb\("decor_effects"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS appearance_group_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS decor_effects jsonb/);
  assert.match(migration, /WHERE item\.kind = 'decor' AND item\.image_url = source\.image_url/);
  assert.match(route, /appearanceGroupId: original\.appearanceGroupId \?\? original\.id/);
  assert.match(route, /decorEffects: original\.decorEffects/);
  assert.match(route, /app\.patch\("\/api\/admin\/pet-park\/items\/:id\/appearance"/);
  const appearanceRoute = route.split('app.patch("/api/admin/pet-park/items/:id/appearance"')[1]
    ?.split('// Edit the optional alternate image')[0] ?? "";
  assert.match(appearanceRoute, /decorAppearanceWhere\(source\)/);
  assert.match(appearanceRoute, /isValidParkDecorEffects/);
  assert.match(appearanceRoute, /patch\.imageUrl/);
  assert.match(appearanceRoute, /patch\.tapImageUrl/);
  assert.match(appearanceRoute, /patch\.decorEffects/);
  assert.doesNotMatch(appearanceRoute, /patch\.(xPct|yPct|size|flipped|layer|isWaterSource)/,
    "appearance edits may never rewrite individual placements or behavior");
  assert.match(route, /decorAppearanceWhere\(original\)/,
    "the old tap-image editor also updates linked copies");
  assert.match(route, /app\.patch\("\/api\/admin\/pet-park\/items\/:id"/,
    "the independent placement PATCH remains available");
});

test("park scene uses time-only lighting, dims decor and pets, and preserves tappable garden controls", () => {
  const park = read("client/src/pages/PetParkPage.tsx");
  const room = read("client/src/components/PetParkInteriorRoom.tsx");
  const atmosphere = read("client/src/components/HomeOutdoorAtmosphere.tsx");
  assert.match(park, /useHomeOutdoorLighting\("auto"\)/);
  assert.match(park, /data-testid="pet-park-auto-day-night"/);
  assert.match(park, /<HomeOutdoorAtmosphereLayer darkness=\{parkLighting\.darkness\}/);
  assert.match(park, /panX=\{camera\.x\} panY=\{camera\.y\}/);
  assert.match(park, /sunlightStrength=\{parkLighting\.daylightStrength\}/);
  assert.match(park, /<PetParkDecorEffects effects=\{item\.decorEffects \?\? \[\]\}/);
  assert.match(park, /data-testid="pet-park-garden-plot"/);
  assert.match(park, /data-testid="pet-park-water-source"/);
  assert.doesNotMatch(park, /<HomeDayNightToggle/);
  assert.match(room, /sunlightStrength=\{sunlightStrength\}/);
  assert.match(atmosphere, /top: panY/);
  assert.match(read("client/src/components/PetParkDecorEffects.tsx"), /pointer-events-none absolute inset-0/);
  assert.match(read("client/src/components/PetParkDecorEffectEditor.tsx"), /onPointerUp=\{finish\}/);
});
