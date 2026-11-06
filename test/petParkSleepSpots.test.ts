import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isParkSleepPosition, parkSleepSpotAtPosition, parkPetSizeOnSleepSpot, parkIndoorPetSizeOnSleepSpot, isParkIndoorSleepPosition } from "../client/src/lib/petParkSleepSpots";
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

test("outdoor resting pet fits the saved admin spot and returns to normal size when moved", () => {
  assert.equal(parkPetSizeOnSleepSpot(point, spots, world), 120);
  assert.equal(parkPetSizeOnSleepSpot({ x: 0.5, y: 0.5 }, spots, world), 180);
  assert.equal(parkPetSizeOnSleepSpot({ x: 0.8, y: 0.75 }, spots, world), 200);
  assert.equal(parkPetSizeOnSleepSpot(point, [{ ...spots[0], size: 400 }], world), 200, "never enlarge beyond base");
  assert.equal(parkSleepSpotAtPosition(point, [{ kind: "decor", xPct: point.x, yPct: point.y, size: 40 }], world), null);
});

test("overlapping outdoor sleep spots follow the nearest admin area", () => {
  const a = { kind: "sleep_spot" as const, xPct: 0.5, yPct: 0.5, size: 160 };
  const b = { kind: "sleep_spot" as const, xPct: 0.51, yPct: 0.5, size: 70 };
  assert.equal(parkSleepSpotAtPosition({ x: 0.51, y: 0.5 }, [a,b], world), b);
  assert.equal(parkPetSizeOnSleepSpot({ x: 0.51, y: 0.5 }, [a,b], world), 70);
});

test("indoor sleeping pet uses the actual panned artwork size, not the device width", () => {
  const effect = [{ type: "sleep", x: 0.55, y: 0.6, size: 20 }];
  const image = { width: 1050, height: 700 };
  assert.equal(parkIndoorPetSizeOnSleepSpot({ x: 0.55, y: 0.6 }, effect, image), 140);
  assert.equal(parkIndoorPetSizeOnSleepSpot({ x: 0.72, y: 0.6 }, effect, image), 225);
  assert.equal(parkIndoorPetSizeOnSleepSpot({ x: 0.55, y: 0.6 }, effect, { width: 0, height: 0 }), 225);
  assert.equal(parkIndoorPetSizeOnSleepSpot({ x: 0.55, y: 0.6 }, [{ type: "fire", x: 0.55, y: 0.6, size: 20 }], image), 225);
});

test("indoor sleep detection follows the same image-space area as resizing", () => {
  const effects = [{ type: "sleep", x: .5, y: .65, size: 22 }];
  const artwork = { width: 980, height: 800 };
  assert.equal(isParkIndoorSleepPosition({ x: .5, y: .65 }, effects, artwork), true);
  assert.equal(parkIndoorPetSizeOnSleepSpot({ x: .5, y: .65 }, effects, artwork, 200), 176);
  assert.equal(isParkIndoorSleepPosition({ x: .65, y: .65 }, effects, artwork), false);
  assert.equal(parkIndoorPetSizeOnSleepSpot({ x: .65, y: .65 }, effects, artwork, 200), 200);
  assert.equal(isParkIndoorSleepPosition({ x: .5, y: .65 }, effects, { width: 0, height: 0 }), false);
});
