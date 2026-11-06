import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { petParkInteriorDropPoint } from "../client/src/lib/petParkInteriorDrop";
import { isPetAccessibleParkRoom } from "../shared/petParkRooms";
const schema = readFileSync("shared/schema.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const routes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const admin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");

test("indoor pet coordinates and room references are additive to the existing deposits", () => {
  for (const field of ['buildingId: varchar("building_id")',
    'roomEffectId: varchar("room_effect_id")',
    'interiorXPct: real("interior_x_pct")',
    'interiorYPct: real("interior_y_pct")', 'pose: text("pose")']) {
    assert.ok(schema.includes(field), field);
  }
  for (const field of ["building_id", "room_effect_id", "interior_x_pct",
    "interior_y_pct", "ADD COLUMN IF NOT EXISTS pose"]) {
    assert.ok(migration.includes(field), field);
  }
  assert.match(schema, /petParkRewardClaims = pgTable\("pet_park_reward_claims"/);
});

test("indoor placement checks ownership, capacity and public visibility without settling rewards", () => {
  assert.match(routes, /app\.patch\("\/api\/pet-park\/deposits\/:id\/placement", isAuthenticated/);
  assert.match(routes, /eq\(petParkDeposits\.userId, userId\)/);
  assert.match(routes, /\.for\("update"\)/);
  assert.match(routes, /others\.length >= building\.maxPets/);
  assert.match(routes, /others\.filter\(item => item\.roomEffectId === roomEffectId\)\.length >= room\.maxPets/);
  assert.match(routes, /isPetAccessibleParkRoom\(room\)/);
  assert.match(routes, /showInPark: false, parkXPct: null, parkYPct: null/);
  assert.match(routes, /eq\(petParkDeposits\.buildingId, buildingId\)/);
  assert.match(routes, /checkpointAt: petParkDeposits\.checkpointAt/);
  assert.match(routes, /isNotNull\(petParkDeposits\.buildingId\)/);
  assert.doesNotMatch(routes.split('app.patch("/api/pet-park/deposits/:id/placement"')[1].split("// Collection and withdrawal")[0],
    /checkpointPetParkClaim|settleDeposit|petParkRewardClaims/);
});

test("shared indoor occupants are filtered to their exact building and room", () => {
  assert.match(page, /const outdoorPets = \(scene\?\.sharedPets \?\? \[\]\)\.filter\(pet => !pet\.buildingId\)/);
  assert.match(page, /const buildingOccupants = \(scene\?\.sharedPets \?\? \[\]\)\.filter\(pet => pet\.buildingId === activeBuilding\?\.id/);
  assert.match(page, /const indoorVisiblePets = buildingOccupants\.filter\(pet =>/);
  assert.match(page, /\(pet\.roomEffectId \?\? null\) === currentRoomId/);
  assert.match(page, /indoorVisiblePets\.map\(pet =>/);
  assert.match(page, /<PetParkPetPortrait petTemplateId=\{pet\.petTemplateId\}/);
  assert.match(page, /Math\.max\(68, Math\.min\(104, roomHeight \* 0\.12\)\)/);
  assert.match(page, /data-testid="pet-park-interior-slots"/);
  assert.match(page, /petParkInteriorDropPoint\(/);
  assert.match(page, /onOpenRoom=\{showRoomEffect\}/);
  assert.match(page, /onToggleEffect=\{effect => toggleParkInteriorLight/);
});

test("full-page rooms may hold pets; centered popups cannot", () => {
  const fullRoom = { id: "one", type: "room", view: "full_page", imageUrl: "/room.png",
    name: "Room", x: .5, y: .5, size: 14, maxPets: 5 } as const;
  assert.equal(isPetAccessibleParkRoom(fullRoom), true);
  assert.equal(isPetAccessibleParkRoom({ ...fullRoom, view: "popup" }), false);
  assert.match(page, /!popupRoom && <div data-testid="pet-park-interior-slots"/);
  assert.match(page, /View-only · No pet placement/);
  assert.match(admin, /count > room\.maxPets/);
});

test("indoor dragging converts viewport touch coordinates to panned artwork coordinates", () => {
  const point = petParkInteriorDropPoint({ x: 150, y: 400 },
    { left: 0, top: 40, width: 400, height: 760 },
    { left: -300, top: 40, width: 1200, height: 760 });
  assert.ok(point);
  assert.equal(point.xPct, 0.375);
  assert.equal(point.yPct, 360/760);
  assert.equal(petParkInteriorDropPoint({ x: 150, y: 820 },
    { left: 0, top: 40, width: 400, height: 760 },
    { left: -300, top: 40, width: 1200, height: 760 }), null);
});

test("effect depth is above all decorations while indoor artwork is passively layered below room interactions", () => {
  assert.match(page, /item\.kind === "effect" \|\| item\.kind === "sleep_spot" \? 12_000_000/);
  assert.match(page, /transform: "translate\(-50%, -88%\)", zIndex: 2/);
  assert.match(page, /!activeBuilding && <PetParkTerrain/);
  assert.match(page, /!activeBuilding && <div className="absolute top-0 left-0 pointer-events-none"/);
  assert.match(page, /\$\{buildingOccupants\.length\}\/\$\{activeBuilding\.maxPets\} pets inside/);
});

test("large shared parks index only active building occupants", () => {
  assert.match(schema, /pet_park_deposits_building_active_idx/);
  assert.match(schema, /\.on\(t\.buildingId, t\.roomEffectId\)\.where/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS pet_park_deposits_building_active_idx/);
  assert.match(migration, /WHERE withdrawn_at IS NULL AND building_id IS NOT NULL/);
});

test("static indoor portraits unmount offscreen art and mini-pet renderers", () => {
  const portrait = readFileSync("client/src/components/PetParkPetPortrait.tsx", "utf8");
  assert.match(portrait, /IntersectionObserver\(entries =>/);
  assert.match(portrait, /setVisible\(current => current === nearViewport \? current : nearViewport\)/);
  assert.match(portrait, /return \(\) => observer\.disconnect\(\)/);
  assert.match(portrait, /mode="static"/);
  assert.match(portrait, /\{visible && <div/);
  assert.doesNotMatch(portrait, /if \(visible\) return;/);
});
