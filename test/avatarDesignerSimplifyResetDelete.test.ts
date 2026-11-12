import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  wardrobeLayers, type PlayerAvatarState,
} from "../client/src/lib/playerAvatarWardrobe";
import { changePlayerAvatarBaseSchema } from "../shared/playerAvatarEquipment";

const read = (path: string) => readFileSync(path, "utf8");
function avatarFixture(): PlayerAvatarState {
  const entry = (category: "hair" | "face", inventoryId: string) => ({
    category, inventoryId, shopItemId: inventoryId, name: inventoryId,
    imageUrl: null, quantity: 1, isListed: false, compatible: true,
    universal: true, segments: [{
      partType: "head" as const, imageUrl: "/head.png", renderPlane: "with_part" as const,
      canvasAligned: true, slot: category === "face" ? "face_open_eyes" as const : "hair_front" as const,
      fit: { xPct: 50, yPct: 50, widthPct: 100,
        pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 50 },
    }],
  });
  const hair = entry("hair", "hair-1"), face = entry("face", "face-1");
  return {
    created: true, revision: 2, skinTone: null, base: null,
    ownedClothing: [hair, face], equipped: [{
      category: "hair", inventoryId: hair.inventoryId, shopItemId: hair.shopItemId,
      name: hair.name, imageUrl: null, segments: hair.segments,
    }],
    unavailableEquipmentSlots: [],
  };
}

test("multiple selected category parts survive toggling a body", () => {
  const avatar = avatarFixture();
  const selected = [
    { category: "hair" as const, inventoryId: "hair-1" },
    { category: "face" as const, inventoryId: "face-1" },
  ];
  assert.deepEqual(wardrobeLayers(avatar, selected).map(item => item.category),
    ["hair", "face"]);
  assert.deepEqual(wardrobeLayers(avatar, selected).map(item => item.inventoryId),
    ["hair-1", "face-1"]);
  assert.equal(avatar.equipped.length, 1, "preview does not persist mutations");
  assert.deepEqual(wardrobeLayers(avatar, [], true), [], "reset clears all visible equipment");
  assert.deepEqual(wardrobeLayers(avatar, selected, true).map(item => item.inventoryId),
    ["hair-1", "face-1"], "new choices after reset still preview correctly");
});

test("clearing worn items is an explicit revisioned appearance save", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(changePlayerAvatarBaseSchema.safeParse({
    baseId: id, skinTone: null, keepSnapshot: true,
    expectedRevision: 2, clearClothing: true,
  }).success, true);
  assert.equal(changePlayerAvatarBaseSchema.safeParse({
    baseId: id, expectedRevision: -1, clearClothing: true,
  }).success, false);
  const route = read("server/routes/playerAvatar.routes.ts");
  assert.match(route, /if \(input\.data\.clearClothing\) \{/);
  assert.match(route, /tx\.delete\(playerAvatarEquipment\)/);
  assert.match(route, /revision: profile\.revision \+ 1/);
});

test("fixed character preview with only details-area scrolling", () => {
  const page = read("client/src/pages/PlayerAvatarPage.tsx");
  const css = read("client/src/pages/PlayerAvatarPage.css");
  assert.doesNotMatch(page, /Design Your Character|Your personal look for Veridia|Start your journey/);
  assert.match(page, /data-testid="avatar-scrollable-details"/);
  assert.match(page, /data-testid="avatar-reset-character"/);
  assert.match(page, /setPreviewSelections\(\{\}\)/);
  assert.match(page, /onClick=\{\(\) => \{ setBodyChoiceId\(option.id\); showSparkle\(\); \}\}/);
  assert.match(css, /\.player-avatar-page\s*\{[^}]*overflow: hidden/s);
  assert.match(css, /\.player-avatar-page__details\s*\{[^}]*overflow-y: auto/s);
  assert.match(css, /\.player-avatar-page__showcase\s*\{[^}]*touch-action: manipulation/s);
});

test("full-canvas face follows the head's world pivot, not canvas center", () => {
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  assert.match(renderer, /const attachment = partByType.get\(layer.segment.partType\)/);
  assert.match(renderer, /transformOrigin: attachment \? `\$\{attachment\.xPct\}% \$\{attachment\.yPct\}%`/);
  assert.match(renderer, /data-character-motion-part=\{layer\.segment\.partType\}/);
});

test("deleting clothing retires rather than destroying ownership", () => {
  const admin = read("server/routes/playerClothingAdmin.routes.ts");
  const player = read("server/routes/playerAvatar.routes.ts");
  const shop = read("server/routes.ts");
  const migration = read("server/startup/migrations/ensurePlayerClothingStorage.ts");
  const ui = read("client/src/components/PlayerClothingAdminPanel.tsx");
  assert.match(admin, /app\.delete\("\/api\/admin\/player-character\/clothing\/item\/:id", isAdmin/);
  assert.match(admin, /draft\.revision !== revision/);
  assert.match(admin, /deletedAt: new Date\(\)/);
  assert.match(admin, /tx\.delete\(playerAvatarEquipment\)/);
  assert.match(admin, /shopItemIds: shop\.ids\.filter\(id => id !== draft\.shopItemId\)/);
  assert.match(admin, /shopItemPlacements: shop\.placements\.filter\(item => item\.itemId !== draft\.shopItemId\)/);
  assert.doesNotMatch(admin, /tx\.delete\(userInventory\)/);
  assert.match(player, /isNull\(playerClothingDrafts\.deletedAt\)/);
  assert.match(shop, /isNull\(playerClothingDrafts\.deletedAt\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS deleted_at timestamp/);
  assert.match(ui, /avatar-delete-clothing-item/);
  assert.match(ui, /avatar-confirm-delete-clothing/);
});
