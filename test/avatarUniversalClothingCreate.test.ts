import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAYER_CLOTHING_FREE_SLOTS,
  canvasClothingFit,
  playerClothingDefinitionSchema,
} from "../shared/playerCharacterClothing";
import { saveUniversalClothingItemSchema } from "../shared/playerClothingAdmin";

const png = "data:image/png;base64,aGVsbG8=";
const image = (slot: string, partType: string) => ({ slot, partType, imageData: png });
const create = (category: string, images: unknown[], keep: unknown[] = []) => ({
  name: "Example", category, images, keep,
});
const read = (path: string) => readFileSync(path, "utf8");

test("one universal item may contain multiple images attached to the same animated bone", () => {
  assert.equal(PLAYER_CLOTHING_FREE_SLOTS.length, 12);
  const request = create("top", [
    image("piece_1", "top"), image("piece_2", "top"), image("piece_3", "left_arm"),
  ]);
  assert.equal(saveUniversalClothingItemSchema.safeParse(request).success, true);
  const segments = request.images.map((part, i) => ({
    slot: part.slot, partType: part.partType,
    imageUrl: "/api/media/" + String(i).padStart(2, "0"),
    canvasAligned: true, fit: canvasClothingFit(), renderPlane: "with_part",
  }));
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name: "Example", category: "top", segments,
  }).success, true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...request, images: [image("piece_1", "top"), image("piece_1", "left_arm")],
  }).success, false);
  assert.equal(saveUniversalClothingItemSchema.safeParse(create("top",
    [image("face_open_eyes", "head")])).success, false);
});

test("face requires Open Eyes, Closed Eyes and Mouth following the head", () => {
  const face = create("face", [
    image("face_open_eyes", "head"), image("face_closed_eyes", "head"),
    image("face_mouth", "head"),
  ]);
  assert.equal(saveUniversalClothingItemSchema.safeParse(face).success, true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...face, images: face.images.slice(0, 2),
  }).success, false);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...face, images: [image("face_open_eyes", "top"), ...face.images.slice(1)],
  }).success, false);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...face, images: [...face.images, image("piece_1", "head")],
  }).success, false);
});

test("single-action edit reuses saved slots with revision checks, never arbitrary art URLs", () => {
  const id = "00000000-0000-4000-8000-000000000012";
  const update = create("hair", [], [
    { previousSlot: "hair_front", slot: "piece_1", partType: "head" },
    { previousSlot: "hair_back", slot: "piece_2", partType: "head" },
  ]);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...update, id, expectedRevision: 3,
  }).success, true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...update, id,
  }).success, false);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...update, expectedRevision: 3,
  }).success, false);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...update, id, expectedRevision: 3, imageUrl: "https://example.invalid/image.png",
  }).success, false);
});

test("universal saves are marked in the catalog and allow both bodies to keep their clothes", () => {
  const admin = read("server/routes/playerClothingAdmin.routes.ts");
  const player = read("server/routes/playerAvatar.routes.ts");
  const migration = read("server/startup/migrations/ensurePlayerClothingStorage.ts");
  assert.match(admin, /saveUniversalClothingItemSchema.safeParse/);
  assert.match(admin, /universal: true/);
  assert.match(admin, /shopItemId: itemId/);
  assert.match(admin, /await db.transaction\(async tx/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS universal boolean NOT NULL DEFAULT false/);
  assert.match(player, /universal: item.universal/);
  assert.match(player, /worn.filter\(entry => entry.universal\)/);
  assert.match(player, /notInArray\(playerAvatarEquipment.category, keepCategories\)/);
});
