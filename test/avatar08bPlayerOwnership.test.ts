import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createPlayerAvatarSchema,
  changePlayerAvatarBaseSchema,
  savePlayerAvatarEquipmentSchema,
  isEligiblePlayerClothingInventory,
  playerClothingCategorySchema,
} from "../shared/playerAvatarEquipment";
import { getGameItemCategory, getGameItemGroup } from "../shared/itemTaxonomy";

const read = (path: string) => readFileSync(path, "utf8");
const baseId = "00000000-0000-4000-8000-000000000001";
const otherBaseId = "00000000-0000-4000-8000-000000000002";
const inventoryId = "00000000-0000-4000-8000-000000000003";

test("first avatar creation is an explicit per-user server action, never inferred from a published admin base", () => {
  assert.equal(createPlayerAvatarSchema.safeParse({ baseId }).success, true);
  assert.equal(createPlayerAvatarSchema.safeParse({ baseId: "any" }).success, false);
  assert.equal(createPlayerAvatarSchema.safeParse({ baseId, userId: "different-user" }).success, false);
  assert.equal(changePlayerAvatarBaseSchema.safeParse({ baseId, expectedRevision: 0 }).success, true);
  assert.equal(changePlayerAvatarBaseSchema.safeParse({ baseId, expectedRevision: -1 }).success, false);
  const route = read("server/routes/playerAvatar.routes.ts");
  assert.match(route, /created: !!profile/);
  assert.match(route, /"\/api\/player-avatar\/create", isAuthenticated/);
  assert.match(route, /tx\.insert\(playerAvatarProfiles\)/);
  assert.match(route, /\.onConflictDoNothing\(\)/);
  assert.match(route, /Create a player avatar first/);
  assert.doesNotMatch(read("server/routes/account.routes.ts"), /playerAvatarProfiles|player_avatar_profiles/);
});

test("all seven clothing slots share one persisted account equipment model", () => {
  assert.deepEqual(playerClothingCategorySchema.options, [
    "head", "hair", "face", "top", "bottom", "shoes", "back",
  ]);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({
    expectedRevision: 2, inventoryId,
  }).success, true);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({
    expectedRevision: 2, inventoryId: null,
  }).success, true);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({
    expectedRevision: 2, inventoryId: baseId, userId: "forged-owner",
  }).success, false);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({
    expectedRevision: 2, inventoryId: "not-a-uuid",
  }).success, false);
  assert.equal(savePlayerAvatarEquipmentSchema.safeParse({
    expectedRevision: Number.NaN, inventoryId,
  }).success, false);
});

const valid = {
  ownerId: "player-a", playerId: "player-a",
  itemType: "clothing", quantity: 1, isListed: false,
  itemCategory: "bottom", requestedCategory: "bottom",
  designBaseId: baseId, selectedBaseId: baseId,
  designBasePublishedAt: new Date("2026-11-09T12:00:00.000Z"),
  selectedBasePublishedAt: new Date("2026-11-09T12:00:00.000Z"),
  publishedSegmentsCount: 2,
};

test("clothing equipment eligibility enforces actual ownership, listing, stock, slot and fitting version", () => {
  assert.equal(isEligiblePlayerClothingInventory(valid), true);
  for (const changes of [
    { ownerId: "player-b" },
    { itemType: "costume" },
    { quantity: 0 },
    { quantity: -3 },
    { isListed: true },
    { itemCategory: "top" },
    { requestedCategory: "shoes" },
    { designBaseId: otherBaseId },
    { selectedBaseId: otherBaseId },
    { selectedBasePublishedAt: new Date("2026-11-10T12:00:00.000Z") },
    { publishedSegmentsCount: 0 },
  ]) {
    assert.equal(isEligiblePlayerClothingInventory({ ...valid, ...changes }), false,
      JSON.stringify(changes));
  }
});

test("saved player anatomy is snapshotted and will not silently change after admin republish", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");
  const routes = read("server/routes/playerAvatar.routes.ts");
  assert.match(schema, /playerAvatarProfiles = pgTable\("player_avatar_profiles"/);
  assert.match(schema, /baseParts: jsonb\("base_parts"\)/);
  assert.match(schema, /playerAvatarEquipment = pgTable\("player_avatar_equipment"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_avatar_profiles/);
  assert.match(migration, /base_parts jsonb NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_avatar_equipment/);
  assert.match(migration, /UNIQUE \(user_id, category\)/);
  assert.match(migration, /REFERENCES user_inventory\(id\) ON DELETE CASCADE/);
  assert.match(routes, /baseParts: resolvePlayerCharacterParts\(base\.publishedParts\)/);
  assert.match(routes, /parts: resolvePlayerCharacterParts\(profile\.baseParts\)/);
  assert.match(routes, /\.for\("share"\)/);
  assert.match(routes, /\.for\("update"\)/);
  assert.match(routes, /revision: profile\.revision \+ 1/);
  assert.match(routes, /tx\.delete\(playerAvatarEquipment\)/);
});

test("the wardrobe queries only the authenticated account's inventory and validates its catalog definition", () => {
  const routes = read("server/routes/playerAvatar.routes.ts");
  assert.match(routes, /"\/api\/player-avatar", isAuthenticated/);
  assert.match(routes, /"\/api\/player-avatar\/base", isAuthenticated/);
  assert.match(routes, /"\/api\/player-avatar\/equipment\/:category", isAuthenticated/);
  assert.match(routes, /eq\(userInventory\.userId, userId\)/);
  assert.match(routes, /eq\(userInventory\.userId, user\.id\)/);
  assert.match(routes, /eq\(shopItems\.type, "clothing"\)/);
  assert.match(routes, /gt\(userInventory\.quantity, 0\)/);
  assert.match(routes, /playerClothingDefinitionSchema\.safeParse/);
  assert.match(routes, /isEligiblePlayerClothingInventory/);
  assert.match(routes, /\.innerJoin\(playerClothingDrafts/);
  assert.match(routes, /\.onConflictDoUpdate\(/);
  assert.match(routes, /"Cache-Control", "private, no-store"/);
  assert.doesNotMatch(routes, /costumeInventoryId|petEquippedCostumes|activePetId/);
});

test("published outfit categories never change when only an admin draft is edited", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");
  const admin = read("server/routes/playerClothingAdmin.routes.ts");
  const player = read("server/routes/playerAvatar.routes.ts");
  assert.match(schema, /publishedCategory: text\("published_category"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS published_category/);
  assert.match(migration, /SET published_category = category/);
  assert.match(admin, /publishedCategory: draft\.category/);
  assert.match(player, /category: playerClothingDrafts\.publishedCategory/);
  assert.match(player, /itemCategory: published\.data\.category/);
});

test("avatar clothing has its own inventory taxonomy, not Specials or pet adornments", () => {
  assert.equal(getGameItemCategory({ type: "clothing" }), "clothing");
  assert.equal(getGameItemGroup("clothing"), "avatars");
  assert.equal(getGameItemCategory({ type: "costume" }), "costumes");
  assert.notEqual(getGameItemGroup("costumes"), getGameItemGroup("clothing"));
  const controls = read("client/src/components/ItemDatabaseSection.tsx");
  assert.match(controls, /clothing: "#d6bd76"/);
});

test("08B adds no premature Home cutover, player wardrobe page, or shop purchase unlock", () => {
  const route = read("server/routes.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const avatar = read("server/routes/playerAvatar.routes.ts");
  assert.match(route, /registerPlayerAvatarRoutes\(app, \{ db, isAuthenticated \}\)/);
  assert.match(boot, /await ensurePlayerAvatarEquipmentStorage\(\)/);
  assert.match(route, /if \(shopItem\.type === "clothing"\)/);
  assert.doesNotMatch(read("client/src/pages/HomePage.tsx"), /player-avatar\/create|player_avatar_profiles/);
  assert.doesNotMatch(avatar, /app\.post\("\/api\/shop\//);
});
