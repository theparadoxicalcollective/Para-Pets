import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createPlayerAvatarSchema, REQUIRED_AVATAR_CREATION_CATEGORIES,
  requiredAvatarCreationCategoriesForBody,
} from "../shared/playerAvatarEquipment";

const baseId = "00000000-0000-4000-8000-000000000001";
const inventoryId = "00000000-0000-4000-8000-000000000002";
const garment = { inventoryId };
const required = { top: garment, bottom: garment, face: garment };

test("Fem requires Top, Bottoms and Face; Masc may save without a Top", () => {
  assert.deepEqual(REQUIRED_AVATAR_CREATION_CATEGORIES, ["top", "bottom", "face"]);
  assert.deepEqual(requiredAvatarCreationCategoriesForBody("Fem"), ["top", "bottom", "face"]);
  assert.deepEqual(requiredAvatarCreationCategoriesForBody("Masc"), ["bottom", "face"]);
  assert.deepEqual(requiredAvatarCreationCategoriesForBody("mAsC"), ["bottom", "face"]);
  assert.deepEqual(requiredAvatarCreationCategoriesForBody(undefined), ["top", "bottom", "face"]);
  assert.equal(createPlayerAvatarSchema.safeParse({ baseId }).success, false);
  for (const missing of ["bottom", "face"] as const) {
    const incomplete = { ...required };
    delete (incomplete as Partial<typeof required>)[missing];
    assert.equal(createPlayerAvatarSchema.safeParse({ baseId, outfit: incomplete }).success, false,
      missing + " must be present");
  }
  const mascOutfit = { bottom: garment, face: garment };
  assert.equal(createPlayerAvatarSchema.safeParse({ baseId, outfit: mascOutfit }).success, true,
    "shape permits Top to be absent; the server checks the selected body before saving");
  assert.equal(createPlayerAvatarSchema.safeParse({ baseId, outfit: required }).success, true);
  assert.equal(createPlayerAvatarSchema.safeParse({
    baseId, outfit: { ...required, shoes: garment, hair: garment },
  }).success, true, "other accessories remain optional");
  assert.equal(createPlayerAvatarSchema.safeParse({
    baseId, outfit: { ...required, top: { inventoryId: "not-uuid" } },
  }).success, false);
  assert.equal(createPlayerAvatarSchema.safeParse({
    baseId, outfit: { ...required, invented: garment },
  }).success, false, "unknown outfit categories rejected");
  assert.equal(createPlayerAvatarSchema.safeParse({
    baseId, outfit: { ...required, top: { inventoryId, colorTint: "red" } },
  }).success, false, "unsafe colors rejected");
});

test("first-save validates all selected clothing inside one atomic transaction", () => {
  const server = readFileSync("server/routes/playerAvatar.routes.ts", "utf8");
  const firstSave = server.split('app.post("/api/player-avatar/create"')[1]
    .split('app.patch("/api/player-avatar/base"')[0];
  const validationAt = firstSave.indexOf("const outfitToSave");
  const creationAt = firstSave.indexOf("tx.insert(playerAvatarProfiles)");
  const equipmentAt = firstSave.indexOf("tx.insert(playerAvatarEquipment)");
  assert.ok(validationAt >= 0 && validationAt < creationAt && creationAt < equipmentAt);
  assert.match(firstSave, /isEligiblePlayerClothingInventory/);
  assert.match(firstSave, /base\.name\.trim\(\)\.toLowerCase\(\) !== "masc" && !input\.data\.outfit\.top/);
  assert.match(firstSave, /item.colorPickerEnabled/);
  assert.match(firstSave, /onConflictDoNothing\(\)/);
  assert.match(firstSave, /Retried POST never rewrites/);
  const creator = readFileSync("client/src/pages/PlayerAvatarPage.tsx", "utf8");
  assert.match(creator, /missingFirstOutfit\.length > 0/);
  assert.match(creator, /data-testid="avatar-required-clothing-status"/);
  assert.match(creator, /outfit: firstOutfit as AvatarCreationOutfit/);
  assert.match(creator, /requiredAvatarCreationCategoriesForBody\(selectedBody\?\.name\)/);
  assert.match(creator, /activeId === item\.inventoryId \? null : item\.inventoryId/);
  assert.match(creator, /setSavedCelebration\(\{ accountId: input\.accountId \}\)/);
  assert.match(creator, /data-testid="avatar-save-celebration"/);
  assert.match(creator, /Character Saved!/);
  assert.match(creator, /setTimeout\(\(\) => navigate\(fromHome \? "\/" : "\/bag"\), 2800\)/);
  assert.match(creator, /clearTimeout\(timeout\)/);
  assert.match(creator, /data-testid="avatar-save-celebration-continue"/);
  assert.doesNotMatch(creator, /toast\(\{ title: "Character saved"/);
});

test("creator prefers saved main clothing art while retaining missing-image fallback", () => {
  const creator = readFileSync("client/src/pages/PlayerAvatarPage.tsx", "utf8");
  const read = readFileSync("server/routes/playerAvatar.routes.ts", "utf8");
  const admin = readFileSync("server/routes/playerClothingAdmin.routes.ts", "utf8");
  assert.match(creator, /wardrobeThumbnail = item.imageUrl \|\| bodyArtwork\[0\]\?\.imageUrl/);
  assert.match(read, /mainImageUrl: playerClothingDrafts\.shopImageUrl/);
  assert.match(read, /imageUrl: item.mainImageUrl \|\| item.imageUrl/);
  assert.match(admin, /imageUrl: draft.shopImageUrl \|\| thumbnail/);
});
