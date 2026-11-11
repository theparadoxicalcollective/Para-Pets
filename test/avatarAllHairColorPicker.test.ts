import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAYER_CLOTHING_CATEGORIES, playerClothingCanRecolor,
} from "../shared/playerCharacterClothing";
import { wardrobeLayers } from "../client/src/lib/playerAvatarWardrobe";

const source = (p: string) => readFileSync(p, "utf8");
const fit = { xPct: 50, yPct: 50, widthPct: 100, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 2 };

test("hair is recolorable for every existing style even without an old admin checkbox", () => {
  for (const flag of [undefined, null, false, true]) {
    assert.equal(playerClothingCanRecolor("hair", flag), true);
  }
  for (const category of PLAYER_CLOTHING_CATEGORIES) {
    if (category === "hair") continue;
    for (const oldFlag of [undefined, null, false, true]) {
      assert.equal(playerClothingCanRecolor(category, oldFlag), false,
        category + " always uses its original authored artwork");
    }
  }
});

test("front and back hair pieces use one per-player color without merging their artwork", () => {
  const hair = {
    category: "hair" as const, inventoryId: "hair-1", shopItemId: "catalog-1",
    name: "Long Hair", imageUrl: "/assets/hair.png",
    colorPickerEnabled: false, colorTint: "#b56b3c",
    segments: [
      { slot: "hair_front", partType: "head", imageUrl: "/assets/front.png", fit, renderPlane: "with_part", canvasAligned: true },
      { slot: "hair_back", partType: "head", imageUrl: "/assets/back.png", fit, renderPlane: "behind_character", canvasAligned: true },
    ],
  };
  const avatar = {
    created: true, revision: 1, base: null, ownedClothing: [],
    equipped: [hair], unavailableEquipmentSlots: [],
  };
  const layers = wardrobeLayers(avatar as any);
  assert.equal(layers.length, 1, "front and back hair remain one equipped catalog item");
  assert.equal(layers[0].colorTint, "#b56b3c", "all hair parts share the persisted tint");
  assert.deepEqual(layers[0].segments.map(s => s.slot), ["hair_front", "hair_back"]);
  assert.deepEqual(layers[0].segments.map(s => s.renderPlane), ["with_part", "behind_character"]);
});

test("creator always exposes hair color input and save/reset, also on first avatar creation", () => {
  const creator = source("client/src/pages/PlayerAvatarPage.tsx");
  const server = source("server/routes/playerAvatar.routes.ts");
  const admin = source("client/src/components/PlayerClothingAdminPanel.tsx");
  const render = source("client/src/components/PlayerCharacterRenderer.tsx");
  assert.match(creator, /playerClothingCanRecolor\(selected\.category, selected\.colorPickerEnabled\)/);
  assert.match(creator, /playerClothingCanRecolor\(garment\.category, garment\.colorPickerEnabled\)/);
  assert.match(creator, /data-testid="avatar-clothing-custom-color"/);
  assert.match(creator, /data-testid="avatar-clothing-reset-color"/);
  assert.match(creator, /data-testid="avatar-save-color-button"/);
  assert.match(creator, /chooseClothing\(item\)/);
  assert.match(server, /colorPickerEnabled: playerClothingCanRecolor\(parsed\.data\.category, item\.colorPickerEnabled\)/);
  assert.match(server, /colorTint: playerClothingCanRecolor\(item\.category, item\.colorPickerEnabled\) \? entry\.colorTint : null/);
  assert.match(server, /playerClothingCanRecolor\(category, item\.colorPickerEnabled\)/);
  assert.match(server, /playerClothingCanRecolor\(slot, item\.colorPickerEnabled\)/);
  assert.doesNotMatch(admin, /data-testid="avatar-clothing-color-picker-enabled"/);
  assert.match(admin, /colorPickerEnabled: category === "hair"/);
  assert.match(render, /layer\.colorTint && <span/);
  assert.match(render, /maskImage: `url\("\$\{layer\.segment\.imageUrl\}"\)`/);
  assert.match(render, /layer\.category === "hair" && isBackArtwork\(layer\)/);
});
