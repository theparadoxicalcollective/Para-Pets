import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PARK_WATER_EFFECT_OPTIONS, isParkEffect } from "../shared/petParkEffects";
import { sanitizeParkInteriorEffects } from "../shared/petParkRooms";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const playerRoutes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const buildingEditor = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
const outdoorEditor = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const room = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
const visual = readFileSync("client/src/components/ParkEffectVisual.tsx", "utf8");

test("all park water effects are available both outdoors and inside buildings", () => {
  const names = PARK_WATER_EFFECT_OPTIONS.map(x => x.type);
  assert.deepEqual(names, ["waterfall_mist", "water_ripple", "water_shimmer", "water_drop"]);
  for (const effect of PARK_WATER_EFFECT_OPTIONS) {
    assert.equal(isParkEffect(effect.type), true);
    assert.ok(effect.interiorSize >= 4 && effect.interiorSize <= 40);
    assert.ok(effect.defaultSize > 0);
  }
  assert.match(outdoorEditor, /PARK_WATER_EFFECT_OPTIONS\.map\(option =>/);
  assert.match(buildingEditor, /PARK_WATER_EFFECT_OPTIONS\.map\(option =>/);
  assert.match(room, /ParkEffectVisual type=\{effect\.type\}/);
  assert.match(room, /isHouseInteriorEffectType\(effect\.type\)/);
  assert.match(room, /isParkWaterEffect\(effect\.type\)/);
});

test("indoor water effects persist with the same constraints as standard room effects", () => {
  const entries = PARK_WATER_EFFECT_OPTIONS.map((option, i) => ({
    id: "water-" + i, type: option.type, x: .22, y: .6, size: option.interiorSize,
  }));
  assert.deepEqual(sanitizeParkInteriorEffects(entries).map(e => e.type),
    PARK_WATER_EFFECT_OPTIONS.map(e => e.type));
  const bad = sanitizeParkInteriorEffects([{ ...entries[0], id: "" }, { ...entries[1], type: "nonexistent" }]);
  assert.deepEqual(bad, []);
});

test("single water drop animates slowly and reduces motion without extra rain or splashes", () => {
  assert.match(visual, /park-water-effect--water_drop:before/);
  assert.match(visual, /animation:parkSingleDrop 7\.2s ease-in infinite/);
  assert.match(visual, /@keyframes parkSingleDrop/);
  assert.match(visual, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(visual, /park-water-effect--water_drop:after/);
});

test("equipped pets are private until explicitly dragged into the outdoor scene", () => {
  assert.match(playerRoutes, /slotNumber, showInPark: false/);
  assert.match(playerRoutes, /eq\(petParkDeposits\.showInPark, true\)/);
  assert.match(playerRoutes, /isNull\(petParkDeposits\.buildingId\)/);
  assert.match(playerRoutes, /isNotNull\(petParkDeposits\.parkXPct\)/);
  assert.match(playerRoutes, /isNotNull\(petParkDeposits\.parkYPct\)/);
  assert.match(page, /data-testid="pet-park-outdoor-drag"/);
  assert.match(page, /dropEquippedPet\(drag\.petId/);
  assert.match(page, /display: "park", xPct: next\.x, yPct: next\.y/);
  assert.match(page, /Return to oval/);
});

test("building visits stay interactive and do not expose or accept indoor pets", () => {
  assert.match(playerRoutes, /res\.status\(410\)/);
  assert.match(page, /<PetParkInteriorRoom/);
  assert.match(page, /onOpenRoom=\{showRoomEffect\}/);
  assert.match(page, /onToggleEffect=\{effect => toggleParkInteriorLight/);
  assert.doesNotMatch(page, /indoorVisiblePets|indoorSlotPointer|pet-park-interior-slots/);
  assert.match(page, /Move armed · drag artwork/);
  assert.match(page, /parkImageHitAt\(/);
});
