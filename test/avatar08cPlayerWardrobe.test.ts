import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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

test("the eight wardrobe buttons are independent of the eight animation parts", () => {
  assert.deepEqual(PLAYER_CLOTHING_CATEGORIES, ["accessories", "head", "hair", "face", "top", "bottom", "shoes", "back"]);
  const page = read("client/src/pages/PlayerAvatarPage.tsx");
  assert.match(page, /PLAYER_CLOTHING_CATEGORIES\.map\(slot =>/);
  assert.match(page, /data-testid=\{\`avatar-category-\$\{slot\}\`\}/);
  assert.match(page, /aria-pressed=\{wardrobeOpen && category === slot\}/);
  assert.match(page, /aria-expanded=\{wardrobeOpen && category === slot\}/);
  assert.match(page, /setWardrobeOpen\(open => next === category \? !open : true\)/);
  assert.match(page, /data-testid="avatar-clothing-category-panel"/);
  assert.match(page, /data-testid="avatar-skin-picker-toggle"/);
  assert.match(page, /\{skinPickerOpen && \(/);
  assert.match(page, /data-testid="avatar-save-celebration"/);
  assert.match(page, /setSavedCelebration\(\{ accountId: input\.accountId \}\)/);
  assert.match(page, /setSkinPickerOpen\(false\)/);
  assert.match(page, /setWardrobeOpen\(false\)/);
  assert.match(page, /PlayerCharacterRenderer/);
  assert.doesNotMatch(page, /PetAnimator|clientToStage|390|844|localStorage/);
});

test("the eight wardrobe categories use their uploaded artwork without extra page copy", () => {
  const page = read("client/src/pages/PlayerAvatarPage.tsx");
  const css = read("client/src/pages/PlayerAvatarPage.css");
  const vite = read("vite.config.ts");
  const html = read("client/index.html");
  const assets = {
    accessories: "ClothingAccesoryIcon.png",
    head: "HeadAccessoriesIcon.png",
    hair: "HairIcon.png",
    face: "FaceIcon.png",
    top: "TopIcon.png",
    bottom: "BottomsIcon.png",
    shoes: "ShoeIcon.png",
    back: "BackAccessoryIcon.png",
  };
  assert.deepEqual(Object.keys(assets), [...PLAYER_CLOTHING_CATEGORIES]);
  for (const [category, filename] of Object.entries(assets)) {
    assert.ok(statSync("attached_assets/uploads/" + filename).size > 0,
      "Missing uploaded " + category + " artwork");
    assert.ok(page.includes('uploads/' + filename + '"'),
      "Player page must import the uploaded icon for " + category);
    assert.match(page, new RegExp(category + ": [a-zA-Z]+Icon,"));
  }
  assert.match(page, /src=\{categoryIcons\[slot\]\}/);
  assert.match(page, /className="player-avatar-page__category-icon"/);
  assert.match(page, /className="sr-only"\>\{PLAYER_CLOTHING_CATEGORY_LABELS\[slot\]\}/);
  assert.match(page, /aria-label=\{PLAYER_CLOTHING_CATEGORY_LABELS\[slot\]\}/);
  assert.match(css, /\.player-avatar-page__category-icon\s*\{/);
  assert.match(css, /object-fit: contain/);
  assert.doesNotMatch(page, /Design Your Character|Your personal look for Veridia|Start your journey/);
  assert.match(page, /aria-label="Reset character to empty base"/);
  assert.match(css, /\.player-avatar-page__details/);
  assert.match(css, /overflow-y: auto/);
  assert.match(html, /family=Great\+Vibes.*Playfair\+Display/);
  assert.match(vite, /wardrobeIconThumbnailPlugin\(\)/);
  assert.match(vite, /resize\(192, 192/);
  assert.match(vite, /\.webp\(\{ quality: 84/);
  assert.doesNotMatch(page, /\{slot === "back" \? "Back" : PLAYER_CLOTHING_CATEGORY_LABELS\[slot\]\}/,
    "Visible category buttons must not fall back to placeholder text");
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
  assert.match(renderer, /clothingSegmentKey\(segment\)/);
  assert.match(renderer, /key=\{layer.key\}/);
  assert.match(renderer, /const isBackArtwork =/);
  assert.match(renderer, /layer.category === "back"/);
  assert.match(renderer, /layer.category === "hair" && layer.segment.renderPlane === "behind_character"/);
  assert.match(renderer, /zIndex: grouped \? 1 : garmentDepth\(layer\)/);
  assert.match(renderer, /style=\{\{ zIndex: garment\.depth, filter: tintFilter\(garment\.color\) \}\}/);
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

test("the player page uses authenticated avatar APIs and previews until Save Character", () => {
  const page = read("client/src/pages/PlayerAvatarPage.tsx");
  const model = read("client/src/lib/playerAvatarWardrobe.ts");
  assert.match(model, /fetch\("\/api\/player-avatar", \{/);
  assert.match(model, /credentials: "include", signal, cache: "no-store"/);
  assert.match(page, /queryFn: \(\{ signal \}\) => fetchPlayerAvatar\(signal\)/);
  assert.match(page, /writePlayerAvatar\("POST", "\/api\/player-avatar\/create"/);
  assert.match(page, /"PUT", "\/api\/player-avatar\/character"/);
  assert.match(page, /expectedRevision: avatar.revision/);
  assert.match(page, /const avatarKey = playerAvatarQueryKey\(userId\)/);
  assert.match(page, /queryKey: avatarKey/);
  assert.match(page, /qc\.setQueryData\(playerAvatarQueryKey\(accountId\), saved\)/);
  assert.match(page, /cacheSavedAvatar\(saved, input\.accountId\)/);
  assert.match(page, /qc\.invalidateQueries\(\{ queryKey: playerAvatarQueryKey\(input\.accountId\) \}\)/);
  assert.doesNotMatch(page, /qc\.setQueryData\(PLAYER_AVATAR_QUERY_KEY, saved\)/);
  assert.match(page, /setPreviewSelections\(\{\}\)/);
  assert.match(page, /setResetPending\(!!avatar\?\.created\)/);
  assert.match(page, /const draftOutfit = PLAYER_CLOTHING_CATEGORIES\.reduce/);
  assert.match(page, /"Character not saved"/);
  assert.match(page, /avatar.created \? "avatar-save-character-button" : "avatar-create-button"/);
  assert.match(page, /onClick=\{\(\) => chooseClothing\(item\)\}/);
  assert.match(page, /const activeId = current\[category\] !== undefined/);
  assert.match(page, /activeId === item\.inventoryId \? null : item\.inventoryId/);
  assert.doesNotMatch(page, /data-testid="avatar-equip-button"/);
  assert.match(page, /data-testid="avatar-unequip-button"/);
  assert.match(page, /data-testid="avatar-owned-inventory"/);
  assert.match(page, /data-testid="avatar-wardrobe-empty"/);
  assert.doesNotMatch(page, /shop\/purchase|costumeInventoryId/);
});

test("Bag remains linked to the isolated wardrobe with PC gating and owned-pet separation", () => {
  const app = read("client/src/App.tsx");
  const bag = read("client/src/components/PetInventory.tsx");
  assert.match(app, /const PlayerAvatarPage\s*= lazy\(/);
  assert.match(app, /location === "\/player-avatar"/);
  assert.match(app, /<StagePageSurface layout="viewport">\s*<PlayerAvatarPage userId=\{user\.id\}/);
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
  assert.match(css, /pointer-events: auto/, "viewport portal children must accept user input");
  assert.match(css, /touch-action: auto/, "parent must not cancel horizontal wardrobe swipes");
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\.player-avatar-page__inventory\s*\{/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /touch-action: pan-x/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
