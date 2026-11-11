import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { saveUniversalClothingItemSchema } from "../shared/playerClothingAdmin";
import { savePlayerAvatarEquipmentSchema } from "../shared/playerAvatarEquipment";

const file = (path: string) => readFileSync(path, "utf8");
const png = "data:image/png;base64,aGVsbG8=";
const clothing = {
  name: "Forest Tunic", category: "top", price: 0, images: [
    { slot: "piece_1", partType: "top", imageData: png },
  ], keep: [],
};
const inventoryId = "00000000-0000-4000-8000-000000000001";

test("admin color picker is an opt-in clothing capability and old saves stay valid", () => {
  for (const enabled of [true, false]) {
    const parsed = saveUniversalClothingItemSchema.safeParse({ ...clothing, colorPickerEnabled: enabled });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.colorPickerEnabled, enabled);
  }
  assert.equal(saveUniversalClothingItemSchema.safeParse(clothing).success, true);
  for (const bad of ["yes", 1, null]) {
    assert.equal(saveUniversalClothingItemSchema.safeParse({ ...clothing, colorPickerEnabled: bad }).success, false);
  }
});

test("wardrobe color requests accept six-digit hex or original and reject unsafe values", () => {
  const input = { inventoryId, expectedRevision: 4 };
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse(input).success, true);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({ ...input, colorTint: null }).success, true);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({ ...input, colorTint: "#AA6633" }).success, true);
  for (const colorTint of ["red", "#aaa", "#12345678", "url(x)", "<img>", 45]) {
    assert.equal(savePlayerAvatarEquipmentSchema.safeParse({ ...input, colorTint }).success, false);
  }
});

test("admin publication and avatar saves store color metadata without altering clothing depth", () => {
  const schema = file("shared/schema.ts");
  const adminMigration = file("server/startup/migrations/ensurePlayerClothingStorage.ts");
  const avatarMigration = file("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");
  const adminServer = file("server/routes/playerClothingAdmin.routes.ts");
  const playerServer = file("server/routes/playerAvatar.routes.ts");
  const editor = file("client/src/components/PlayerClothingAdminPanel.tsx");
  const wardrobe = file("client/src/pages/PlayerAvatarPage.tsx");
  const renderer = file("client/src/components/PlayerCharacterRenderer.tsx");
  assert.match(schema, /colorPickerEnabled: boolean\("color_picker_enabled"\)/);
  assert.match(schema, /colorTint: text\("color_tint"\)/);
  assert.match(adminMigration, /ADD COLUMN IF NOT EXISTS color_picker_enabled/);
  assert.match(avatarMigration, /ADD COLUMN IF NOT EXISTS color_tint text/);
  assert.match(adminServer, /colorPickerEnabled: input\.data\.colorPickerEnabled \?\? existing\?\.colorPickerEnabled \?\? false/);
  assert.match(playerServer, /if \(!playerClothingCanRecolor\(slot, item\.colorPickerEnabled\) && input\.data\.colorTint\)/);
  assert.match(playerServer, /if \(existing\?\.inventoryId === inventory\.id\)/);
  assert.match(playerServer, /if \(existing\.colorTint === colorTint\)/);
  assert.match(playerServer, /set: \{ inventoryId: inventory\.id, colorTint, equippedAt:/);
  assert.match(editor, /data-testid="avatar-clothing-color-picker-enabled"/);
  assert.match(wardrobe, /data-testid="avatar-clothing-custom-color"/);
  assert.match(wardrobe, /data-testid="avatar-save-color-button"/);
  assert.match(wardrobe, /saveEquipment\(item\.inventoryId\)/);
  assert.doesNotMatch(wardrobe, /toast\(\{ title: "Wardrobe saved"/);
  assert.match(renderer, /player-character-renderer__legacy-tint/);
  assert.match(renderer, /player-character-renderer__canvas-tint/);
  assert.match(renderer, /clothingLayerDepth\(/);
});

test("mobile wardrobe removes duplicate original skin button and uses a compact shelf", () => {
  const creator = file("client/src/pages/PlayerAvatarPage.tsx");
  const style = file("client/src/pages/PlayerAvatarPage.css");
  assert.doesNotMatch(creator, /aria-label="Original body color"/);
  assert.match(creator, /player-avatar-page__body-divider/);
  assert.match(style, /player-avatar-page__body-divider/);
  assert.match(style, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(style, /clamp\(64px, 18vw, 84px\)/);
  assert.match(style, /player-avatar-page__create \{ margin-top: auto/);
});
