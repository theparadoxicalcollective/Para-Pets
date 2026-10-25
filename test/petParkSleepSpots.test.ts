import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isParkSleepPosition } from "../client/src/lib/petParkSleepSpots";
import { getHouseInteriorSleepSnapPosition, isHouseInteriorSleepPosition, isHouseOutdoorEffectType } from "../shared/housing";

const world = { width: 1100, height: 1700 };
const point = { x: 0.2, y: 0.75 };
const spots = [
  { kind: "sleep_spot" as const, xPct: 0.2, yPct: 0.75, size: 120 },
  { kind: "effect" as const, effectType: "sleep", xPct: 0.5, yPct: 0.5, size: 180 },
];

test("park rest spots and sleep squares activate only inside world-sized interaction areas", () => {
  assert.equal(isParkSleepPosition(point, spots, world), true);
  assert.equal(isParkSleepPosition({ x: 0.5, y: 0.5 }, spots, world), true);
  assert.equal(isParkSleepPosition({ x: 0.26, y: 0.75 }, spots, world), false);
  assert.equal(isParkSleepPosition({ x: 0.2, y: 0.79 }, spots, world), false);
  assert.equal(isParkSleepPosition(point, [{ kind: "decor", xPct: 0.2, yPct: 0.75, size: 120 }], world), false);
  assert.equal(isParkSleepPosition(point, [{ kind: "effect", effectType: "water_ripple", xPct: 0.2, yPct: 0.75, size: 120 }], world), false);
});

test("rest footprints remain measured in world units as Pet Park ground expands", () => {
  const edge = { x: 0.25, y: 0.75 };
  assert.equal(isParkSleepPosition(edge, spots, world), true);
  assert.equal(isParkSleepPosition(edge, spots, { width: 2200, height: 3400 }), false);
  assert.equal(isParkSleepPosition(point, spots, { width: 0, height: 0 }), false);
});

test("Home Bundle outdoor sleep squares reuse the existing sleep snapping rules", () => {
  assert.equal(isHouseOutdoorEffectType("sleep"), true);
  const exterior = [{ id: "outdoor-sleep", type: "sleep" as const, x: 0.4, y: 0.65, size: 18 }];
  assert.equal(isHouseInteriorSleepPosition(exterior, 0.4, 0.65, 1), true);
  assert.deepEqual(getHouseInteriorSleepSnapPosition(exterior, 0.42, 0.66, 1), { effectId: "outdoor-sleep", x: 0.4, y: 0.65 });
  assert.equal(isHouseInteriorSleepPosition(exterior, 0.65, 0.65, 1), false);
});

test("both player scenes actually connect their outdoor sleep regions to pet modes", () => {
  const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const house = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const editor = readFileSync("client/src/components/HomeInteriorEffect.tsx", "utf8");
  assert.match(park, /isParkSleepPosition\(position, scene.items/);
  assert.match(park, /sleeping \? "sleep" : "idle"/);
  assert.match(house, /activeBundle\?\.exteriorEffects \?\? \[\]\)\.filter\(effect => effect.type === "sleep"\)/);
  assert.match(house, /getHouseInteriorSleepSnapPosition\(\s*outdoorSleepDecorEffects/);
  assert.match(editor, /isHouseOutdoorEffectType\(option.type\)/);
});
