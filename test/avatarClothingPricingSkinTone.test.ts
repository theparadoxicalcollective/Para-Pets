import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPlayerAvatarSchema, changePlayerAvatarBaseSchema } from "../shared/playerAvatarEquipment";
import { PLAYER_SKIN_TONE_SWATCHES, playerSkinToneSchema } from "../shared/playerSkinTone";
import { saveUniversalClothingItemSchema } from "../shared/playerClothingAdmin";
const read = (path: string) => readFileSync(path, "utf8");
const baseId = "00000000-0000-4000-8000-000000000001";
const png = "data:image/png;base64,aGVsbG8=";
const clothing = { name: "Scarf", category: "accessories", images: [{
  slot: "piece_1", partType: "head", imageData: png,
}], keep: [] };

test("clothing prices are integer coins; paid items accept separate shop art", () => {
  assert.equal(saveUniversalClothingItemSchema.safeParse({ ...clothing, price: 0 }).success, true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...clothing, price: 225, shopImageData: png,
  }).success, true);
  for (const price of [-1, -15, 1.5, Number.NaN, 1_000_000_001]) {
    assert.equal(saveUniversalClothingItemSchema.safeParse({ ...clothing, price }).success, false);
  }
  assert.equal(saveUniversalClothingItemSchema.safeParse({
    ...clothing, price: 10, shopImageData: "https://other-site.test/art.png",
  }).success, false);
});

test("player skin tones require validated hex or original artwork", () => {
  assert.equal(PLAYER_SKIN_TONE_SWATCHES.length, 8);
  for (const swatch of PLAYER_SKIN_TONE_SWATCHES) {
    assert.equal(playerSkinToneSchema.safeParse(swatch.value).success, true);
    assert.equal(createPlayerAvatarSchema.safeParse({ baseId, skinTone: swatch.value }).success, true);
    assert.equal(changePlayerAvatarBaseSchema.safeParse({
      baseId, skinTone: swatch.value, expectedRevision: 2,
    }).success, true);
  }
  assert.equal(playerSkinToneSchema.safeParse(null).success, true);
  for (const value of ["red", "#ff0000ff", "#fff", "url(https://x.test)", "<img>"]) {
    assert.equal(playerSkinToneSchema.safeParse(value).success, false);
  }
});

test("zero-cost outfits appear as virtual entitlements and are claimed only on Equip", () => {
  const server = read("server/routes/playerAvatar.routes.ts");
  const shop = read("server/routes/playerClothingAdmin.routes.ts");
  const ui = read("client/src/components/PlayerClothingAdminPanel.tsx");
  const migration = read("server/startup/migrations/ensurePlayerClothingStorage.ts");
  assert.match(server, /const freeRows = await db.select/);
  assert.match(server, /eq\(shopItems.price, 0\)/);
  assert.match(server, /inventoryId: item.shopItemId, shopItemId: item.shopItemId/);
  assert.match(server, /const validated = free \? playerClothingDefinitionSchema.safeParse/);
  assert.match(server, /tx.insert\(userInventory\).values/);
  assert.match(server, /eq\(playerClothingDrafts.universal, true\)/);
  assert.match(shop, /price: input.data.price/);
  assert.match(shop, /price > 0 && !shopImageUrl/);
  assert.match(shop, /price > 0 \? shopImageUrl : thumbnail/);
  assert.match(ui, /avatar-clothing-price/);
  assert.match(ui, /avatar-clothing-shop-image-upload/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS shop_image_url text/);
});

test("skin tone persists on player profiles, uses original artwork opt-out and Home tap opens customization", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");
  const server = read("server/routes/playerAvatar.routes.ts");
  const editor = read("client/src/pages/PlayerAvatarPage.tsx");
  const home = read("client/src/components/HomeAvatarStage.tsx");
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  assert.match(schema, /skinTone: text\("skin_tone"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS skin_tone text/);
  assert.match(server, /skinTone: profile\?\.skinTone \?\? null/);
  assert.match(server, /skinTone: input.data.skinTone \?\? null/);
  assert.match(server, /if \(!sameBase\) \{/);
  assert.match(editor, /avatar-skin-tone-picker/);
  assert.match(editor, /avatar-custom-skin/);
  assert.match(editor, /Save Appearance/);
  assert.match(renderer, /player-character-renderer__skin-tint/);
  assert.match(home, /onClick=\{onOpen\}/);
  assert.match(home, /skinTone=\{avatar.data\?\.skinTone \?\? null\}/);
});
