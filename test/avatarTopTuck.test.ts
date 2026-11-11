import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clothingLayerDepth } from "../shared/playerCharacterClothing";
import {
  createPlayerAvatarSchema, changePlayerAvatarBaseSchema, savePlayerAvatarTuckSchema,
} from "../shared/playerAvatarEquipment";
const file = (path: string) => readFileSync(path, "utf8");
const baseId = "00000000-0000-4000-8000-000000000001";

test("untucked tops cover pants; tucked tops sit underneath without changing shoes", () => {
  const bottoms = clothingLayerDepth("bottom", "piece_1");
  const untucked = clothingLayerDepth("top", "piece_1");
  const tucked = clothingLayerDepth("top", "piece_1", "under", true);
  assert.ok(tucked < bottoms && bottoms < untucked);
  assert.equal(untucked, clothingLayerDepth("top", "piece_1", "under", false));
  assert.ok(clothingLayerDepth("shoes", "piece_1", "under") < bottoms);
  assert.ok(clothingLayerDepth("shoes", "piece_1", "over") > bottoms);
  assert.equal(clothingLayerDepth("face", "face_open_eyes", "under", true),
    clothingLayerDepth("face", "face_open_eyes"));
  assert.equal(clothingLayerDepth("accessories", "piece_1", "under", true),
    clothingLayerDepth("accessories", "piece_1"));
});

test("tuck updates are boolean-only, revision-checked, and accepted on first save", () => {
  assert.equal(savePlayerAvatarTuckSchema.safeParse({ topTucked: true, expectedRevision: 2 }).success, true);
  assert.equal(savePlayerAvatarTuckSchema.safeParse({ topTucked: false, expectedRevision: 0 }).success, true);
  assert.equal(savePlayerAvatarTuckSchema.safeParse({ topTucked: "yes", expectedRevision: 0 }).success, false);
  assert.equal(savePlayerAvatarTuckSchema.safeParse({ topTucked: true, expectedRevision: -1 }).success, false);
  assert.equal(createPlayerAvatarSchema.safeParse({
    baseId, topTucked: true,
    outfit: {
      top: { inventoryId: baseId },
      bottom: { inventoryId: baseId },
      face: { inventoryId: baseId },
    },
  }).success, true);
  assert.equal(changePlayerAvatarBaseSchema.safeParse({
    baseId, topTucked: false, expectedRevision: 2,
  }).success, true);
});

test("player profile persistence, Home rendering and Tops checkbox use the same preference", () => {
  const server = file("server/routes/playerAvatar.routes.ts");
  const migration = file("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");
  const schema = file("shared/schema.ts");
  const renderer = file("client/src/components/PlayerCharacterRenderer.tsx");
  const home = file("client/src/components/HomeAvatarStage.tsx");
  const wardrobe = file("client/src/pages/PlayerAvatarPage.tsx");
  assert.match(server, /app\.patch\("\/api\/player-avatar\/tuck", isAuthenticated/);
  assert.match(server, /profile\.revision !== input\.data\.expectedRevision/);
  assert.match(server, /topTucked: profile\?\.topTucked \?\? false/);
  assert.match(server, /profile\.topTucked !== input\.data\.topTucked/);
  assert.doesNotMatch(server.split('app.patch("/api/player-avatar/tuck"')[1].split('app.put("/api/player-avatar/equipment')[0],
    /tx\.delete\(playerAvatarEquipment\)/);
  assert.match(schema, /topTucked: boolean\("top_tucked"\)\.notNull\(\)\.default\(false\)/);
  assert.match(migration, /ALTER TABLE player_avatar_profiles ADD COLUMN IF NOT EXISTS top_tucked boolean NOT NULL DEFAULT false/);
  assert.match(renderer, /topTucked = false/);
  assert.match(home, /topTucked=\{avatar\.data\?\.topTucked \?\? false\}/);
  assert.match(wardrobe, /data-testid="avatar-top-tuck"/);
  assert.match(wardrobe, /checked=\{topTucked\}/);
  assert.match(wardrobe, /player-avatar-page__tuck-check/);
  assert.match(wardrobe, /topTucked && <Check size=\{15\} strokeWidth=\{3\.2\} \/>/);
  const css = file("client/src/pages/PlayerAvatarPage.css");
  assert.match(css, /player-avatar-page__tuck-toggle input:checked \+ \.player-avatar-page__tuck-check/);
  assert.match(css, /min-height: 44px/);
  assert.match(wardrobe, /category === "top"/);
});
