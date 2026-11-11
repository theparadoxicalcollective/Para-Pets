import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { saveUniversalClothingItemSchema } from "../shared/playerClothingAdmin";
import {
  clothingSegmentsForBody, playerClothingBodyVariantsSchema,
  playerClothingDefinitionSchema, type PlayerClothingSegment,
} from "../shared/playerCharacterClothing";

const imageData = "data:image/png;base64,aGVsbG8=";
const fit = { xPct: 50, yPct: 50, widthPct: 100,
  pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 1 };
const makeSegment = (kind: string): PlayerClothingSegment => ({
  partType: "top", slot: "piece_1", canvasAligned: true, renderPlane: "with_part",
  imageUrl: `/api/media/${kind}`, fit,
});
const fem = [makeSegment("fem-art")];
const masc = [makeSegment("masc-art")];
const request = {
  name: "Royal Tunic", category: "top", price: 0, images: [], keep: [],
  bodyVariants: {
    fem: { images: [{ slot: "piece_1", partType: "top", imageData }], keep: [] },
    masc: { images: [{ slot: "piece_1", partType: "top", imageData }], keep: [] },
  },
};

test("one clothing SKU holds two complete independent body artworks", () => {
  assert.equal(saveUniversalClothingItemSchema.safeParse(request).success, true);
  assert.equal(playerClothingBodyVariantsSchema.safeParse({ fem, masc }).success, true);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name: request.name, category: request.category, segments: fem,
  }).success, true);
  assert.equal(clothingSegmentsForBody(fem, { fem, masc }, " Fem "), fem);
  assert.equal(clothingSegmentsForBody(fem, { fem, masc }, "MASC"), masc);
  assert.notEqual(
    clothingSegmentsForBody(fem, { fem, masc }, "Fem")[0].imageUrl,
    clothingSegmentsForBody(fem, { fem, masc }, "Masc")[0].imageUrl,
  );
  assert.equal(clothingSegmentsForBody(fem, null, "Masc"), fem,
    "Old shared items remain usable on both bases");
});

test("both body versions are required, with independent face expressions", () => {
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...request, bodyVariants: { ...request.bodyVariants,
      masc: { images: [], keep: [] } },
  }).success, false);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...request, bodyVariants: { ...request.bodyVariants,
      masc: { images: [{ slot: "piece_1", partType: "top", imageData },
        { slot: "piece_1", partType: "left_arm", imageData }], keep: [] } },
  }).success, false);
  const faceParts = ["face_open_eyes", "face_closed_eyes", "face_mouth"]
    .map(slot => ({ slot, partType: "head", imageData }));
  const face = { ...request, category: "face",
    bodyVariants: {
      fem: { images: faceParts, keep: [] },
      masc: { images: faceParts, keep: [] },
    },
  };
  assert.equal(saveUniversalClothingItemSchema.safeParse(face).success, true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...face, bodyVariants: { ...face.bodyVariants,
      masc: { images: faceParts.slice(0, 2), keep: [] } },
  }).success, false);
});

test("admin and client preserve one ownership item, switch only artwork", () => {
  const admin = readFileSync("client/src/components/PlayerClothingAdminPanel.tsx", "utf8");
  const api = readFileSync("server/routes/playerAvatar.routes.ts", "utf8");
  const wardrobe = readFileSync("client/src/lib/playerAvatarWardrobe.ts", "utf8");
  const migration = readFileSync("server/startup/migrations/ensurePlayerClothingStorage.ts", "utf8");
  assert.match(admin, /data-testid="avatar-clothing-variant-status"/);
  assert.match(admin, /bodyVariants: Object.fromEntries/);
  assert.match(api, /bodyVariants: playerClothingDrafts.publishedBodyVariants/);
  assert.match(wardrobe, /clothingSegmentsForBody/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS published_body_variants jsonb/);
  assert.match(api, /shopItemId: item.shopItemId/);
});
