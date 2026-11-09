import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAYER_CLOTHING_CATEGORIES,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
} from "../shared/playerCharacterClothing";
import {
  wardrobeLayers,
  type PlayerAvatarState,
  type OwnedAvatarClothing,
} from "../client/src/lib/playerAvatarWardrobe";
import { shouldShowDesktopComingSoon } from "../client/src/lib/desktopComingSoon";
import { shouldHideFloatingNav } from "../client/src/lib/playerPagePresentation";
import { usesDeviceGameplaySurface } from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");
const rigPart = (partType: PlayerClothingSegment["partType"]): PlayerClothingSegment => ({
  partType,
  imageUrl: "/api/media/test-asset",
  fit: {
    xPct: 50, yPct: 50, widthPct: 100,
    pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 50,
  },
  renderPlane: "with_part",
});
const owned = (
  category: PlayerClothingCategory,
  id: string,
  segments: PlayerClothingSegment[],
  overrides: Partial<OwnedAvatarClothing> = {},
): OwnedAvatarClothing => ({
  inventoryId: id, shopItemId: `sku-${id}`, name: id, category,
  imageUrl: null, quantity: 1, isListed: false, compatible: true,
  segments, ...overrides,
});
const makeState = (items: OwnedAvatarClothing[]): PlayerAvatarState => ({
  created: true, revision: 7, base: null, ownedClothing: items,
  equipped: items.map(item => ({
    category: item.category, inventoryId: item.inventoryId,
    shopItemId: item.shopItemId, name: item.name, imageUrl: item.imageUrl,
    segments: item.segments,
  })),
  unavailableEquipmentSlots: [],
});

test("the seven wardrobe buttons are not the eight animation parts", () => {
  assert.deepEqual(PLAYER_CLOTHING_CATEGORIES, ["head", "hair", "face", "top", "bottom", "shoes", "back"]);
  const page = read("client/src/pages/PlayerAvatarPage.tsx");
  assert.match(page, /PLAYER_CLOTHING_CATEGORIES\.map\(slot =>/);
  assert.match(page, /data-testid=\{\`avatar-category-\$\{slot\}\`\}/);
  assert.match(page, /aria-pressed=\{category === slot\}/);
  assert.match(page, /PlayerCharacterRenderer/);
  assert.doesNotMatch(page, /PetAnimator|clientToStage|390|844|localStorage/);
});

test("one garment retains independent left and right leg attachments", () => {
  const pants = owned("bottom", "pants", [rigPart("left_leg"), rigPart("right_leg")]);
  const layers = wardrobeLayers(makeState([pants]));
  assert.equal(layers.length, 1);
  assert.deepEqual(layers[0].segments.map(segment => segment.partType), ["left_leg", "right_leg"]);
});

test("hat, hair and face can all use the same head attachment without overwriting each other", () => {
  const items = [
    owned("head", "hat", [rigPart("head")]),
    owned("hair", "hair", [rigPart("head")]),
    owned("face", "face", [rigPart("head")]),
  ];
  const layers = wardrobeLayers(makeState(items));
  assert.deepEqual(layers.map(layer => layer.category), ["head", "hair", "face"]);
  assert.equal(layers.flatMap(layer => layer.segments).filter(segment => segment.partType === "head").length, 3);
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  assert.match(renderer, /key: \`\$\{outfit.category\}:\$\{outfit.inventoryId\}:\$\{segment.partType\}\`/);
  assert.match(renderer, /key=\{layer.key\}/);
  assert.match(renderer, /planeDepth\[layer.segment.renderPlane\]/);
  assert.match(renderer, /player-character-renderer__motion/);
});

test("preview replaces only the selected category without changing the saved equipment", () => {
  const head = owned("head", "old-head", [rigPart("head")]);
  const alternate = owned("head", "new-head", [rigPart("head")]);
  const pants = owned("bottom", "pants", [rigPart("left_leg"), rigPart("right_leg")]);
  const avatar = makeState([head, pants]);
  avatar.ownedClothing.push(alternate);

  const preview = wardrobeLayers(avatar, { category: "head", inventoryId: "new-head" });
  assert.deepEqual(preview.map(x => x.inventoryId), ["new-head", "pants"]);
  assert.deepEqual(avatar.equipped.map(x => x.inventoryId), ["old-head", "pants"]);
  assert.deepEqual(wardrobeLayers(avatar).map(x => x.inventoryId), ["old-head", "pants"]);
});

test("a listed or incompatible item cannot alter the character preview", () => {
  const hat = owned("head", "hat", [rigPart("head")]);
  const unavailable = owned("head", "listed", [rigPart("head")], { isListed: true });
  const wrongBase = owned("head", "wrong-base", [rigPart("head")], { compatible: false });
  const avatar = makeState([hat]);
  avatar.ownedClothing.push(unavailable, wrongBase);
  for (const inventoryId of ["listed", "wrong-base", "unknown"]) {
    assert.deepEqual(wardrobeLayers(avatar, { category: "head", inventoryId })
      .map(x => x.inventoryId), ["hat"]);
  }
  avatar.unavailableEquipmentSlots = ["head"];
  assert.deepEqual(wardrobeLayers(avatar), []);
});

test("the player page uses the authenticated 08B API and does not save a preview until confirmed", () => {
  const page = read("client/src/pages/PlayerAvatarPage.tsx");
  const model = read("client/src/lib/playerAvatarWardrobe.ts");
  assert.match(page, /fetch\("\/api\/player-avatar", \{ credentials: "include", signal, cache: "no-store" \}\)/);
  assert.match(page, /writePlayerAvatar\("POST", "\/api\/player-avatar\/create"/);
  assert.match(model, /\`\/api\/player-avatar\/equipment\/\$\{input.category\}\`/);
  assert.match(page, /expectedRevision: avatar.revision/);
  assert.match(page, /qc.setQueryData\(PLAYER_AVATAR_QUERY_KEY, saved\)/);
  assert.match(page, /setPreviewId\(null\)/);
  assert.match(page, /error.status === 409/);
  assert.match(page, /data-testid="avatar-create-button"/);
  assert.match(page, /data-testid="avatar-equip-button"/);
  assert.match(page, /data-testid="avatar-unequip-button"/);
  assert.match(page, /data-testid="avatar-owned-inventory"/);
  assert.match(page, /data-testid="avatar-wardrobe-empty"/);
  assert.doesNotMatch(page, /shop\/purchase|costumeInventoryId/);
});

test("Bag links to the isolated mobile wardrobe while the PC gate and pet Home remain unchanged", () => {
  const app = read("client/src/App.tsx");
  const bag = read("client/src/components/PetInventory.tsx");
  assert.match(app, /const PlayerAvatarPage\s*= lazy\(/);
  assert.match(app, /location === "\/player-avatar"/);
  assert.match(app, /<StagePageSurface layout="viewport">\s*<PlayerAvatarPage/);
  assert.match(bag, /data-testid="open-player-avatar-wardrobe"/);
  assert.match(bag, /navigateBag\("\/player-avatar"\)/);
  assert.match(bag, /grid grid-cols-5/);
  assert.equal(usesDeviceGameplaySurface("/player-avatar"), true);
  assert.equal(shouldHideFloatingNav("/player-avatar"), true);
  assert.equal(shouldShowDesktopComingSoon("/player-avatar", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32", maxTouchPoints: 0, touchFirst: false,
  }), true);
  assert.equal(shouldShowDesktopComingSoon("/player-avatar", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    platform: "iPhone", maxTouchPoints: 5, touchFirst: true,
  }), false);
  assert.doesNotMatch(read("client/src/pages/HomePage.tsx"), /PlayerAvatarPage|player-avatar\/create/);
});

test("wardrobe layout scrolls its owned shelf and respects device safe areas", () => {
  const css = read("client/src/pages/PlayerAvatarPage.css");
  assert.match(css, /-webkit-overflow-scrolling: touch/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\.player-avatar-page__inventory\s*\{/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /touch-action: pan-x/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
