import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPetAccessibleParkRoom, sanitizeParkInteriorEffects, type ParkRoomEffect,
} from "../shared/petParkRooms";

const room: ParkRoomEffect = {
  id: "enchanted-door", type: "room", x: 0.4, y: 0.65, size: 14,
  name: "Forest Library", view: "full_page", imageUrl: "/uploads/forest-library.png", maxPets: 5,
};

test("Pet Park room effects use existing Home effects but never change Pet House type lists", () => {
  const actual = sanitizeParkInteriorEffects([{ id: "fire-1", type: "fire", x: 0.25, y: 0.5, size: 13 }, room]);
  assert.equal(actual.length, 2);
  assert.equal(actual[0].type, "fire");
  assert.equal(actual[1].type, "room");
  const housing = readFileSync("shared/housing.ts", "utf8");
  assert.doesNotMatch(housing, /HOUSE_INTERIOR_EFFECT_TYPES = \[[^\]]*"room"/);
});

test("room images can only originate from previously saved server artwork", () => {
  const malicious = { ...room, imageUrl: "https://untrusted.example/pet-room" };
  const newRoom = sanitizeParkInteriorEffects([malicious]);
  assert.equal(newRoom.length, 1);
  assert.equal(newRoom[0].type === "room" && newRoom[0].imageUrl, null);
  const saved = sanitizeParkInteriorEffects([malicious], [room]);
  assert.equal(saved[0].type === "room" && saved[0].imageUrl, room.imageUrl);
});

test("popup rooms can never receive pets, even with uploaded artwork", () => {
  assert.equal(isPetAccessibleParkRoom(room), true);
  assert.equal(isPetAccessibleParkRoom({ ...room, view: "popup" }), false);
  assert.equal(isPetAccessibleParkRoom({ ...room, imageUrl: null }), false);
  assert.equal(isPetAccessibleParkRoom({ ...room, maxPets: 0 }), true); // sanitizer enforces minimum 1
  const low = sanitizeParkInteriorEffects([{ ...room, maxPets: -40 }]);
  assert.equal(low[0].type === "room" ? low[0].maxPets : NaN, 1);
  const high = sanitizeParkInteriorEffects([{ ...room, maxPets: 900 }]);
  assert.equal(high[0].type === "room" ? high[0].maxPets : NaN, 25);
});

test("duplicate room IDs cannot overwrite another saved room", () => {
  assert.equal(sanitizeParkInteriorEffects([room, { ...room, name: "Dupe" }], [room]).length, 1);
});

test("legacy room metadata remains safe but room pet placement is retired", () => {
  const player = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
  const admin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  const schema = readFileSync("shared/schema.ts", "utf8");
  const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
  assert.match(schema, /roomEffectId: varchar\("room_effect_id"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS room_effect_id varchar/);
  assert.match(player, /eq\(petParkDeposits\.userId, userId\)/);
  assert.match(player, /res\.status\(410\)/);
  assert.doesNotMatch(player, /roomOccupants\.length >= room\.maxPets/);
  assert.match(admin, /sanitizeParkInteriorEffects\(body\.interiorEffects, existing\.interiorEffects\)/);
  assert.match(admin, /count > room\.maxPets/);
  assert.match(admin, /uploadedRoomUrl = await processWorldImage/);
});

test("admin editing and visitor portals have separate full-room and popup behavior", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const editor = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
  const interior = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
  assert.match(editor, /aria-label="Add effect inside building"/);
  assert.match(editor, /aria-label="Upload room image"/);
  assert.match(editor, /aria-label="Room pet capacity"/);
  assert.match(editor, /Room opening mode/);
  assert.match(interior, /HomeInteriorExitSparkle/);
  assert.match(interior, /onOpenRoom\?\.\(room\)/);
  assert.match(page, /aria-label="Close room popup"/);
  assert.match(page, /View-only · No pet placement/);
  assert.match(page, /fullPageRoom\?\.imageUrl/);
  assert.doesNotMatch(page, /data-testid="pet-park-interior-slots"/);
});
