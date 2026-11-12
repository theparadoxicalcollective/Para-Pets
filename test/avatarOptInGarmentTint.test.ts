import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAYER_CLOTHING_CATEGORIES, playerClothingCanRecolor,
  clothingLayerDepth,
} from "../shared/playerCharacterClothing";
import { wardrobeLayers } from "../client/src/lib/playerAvatarWardrobe";
import { saveUniversalClothingItemSchema } from "../shared/playerClothingAdmin";

const read = (path: string) => readFileSync(path, "utf8");
const fit = { xPct: 50, yPct: 50, widthPct: 100, pivotXPct: 50,
  pivotYPct: 50, rotationDeg: 0, zIndex: 1 };
const image = (partType: string, n: number) => ({
  partType, slot: `piece_${n}`, imageUrl: "/api/media/aaaa-1111",
  canvasAligned: true, fit, renderPlane: "with_part",
});

test("only admin-enabled top/bottom SKUs and all hair can be recolored", () => {
  for (const category of PLAYER_CLOTHING_CATEGORIES) {
    for (const flag of [undefined, null, false, true]) {
      const expected = category === "hair" ||
        (["top", "bottom"].includes(category) && flag === true);
      assert.equal(playerClothingCanRecolor(category, flag), expected,
        `${category} enabled=${String(flag)}`);
    }
  }
});

test("one garment's flag cannot recolor another garment of the same category", () => {
  const owned = [
    { inventoryId: "top-yes", category: "top", colorPickerEnabled: true,
      colorTint: "#775544", segments: [image("top",1), image("left_arm",2), image("right_arm",3)] },
    { inventoryId: "top-no", category: "top", colorPickerEnabled: false,
      colorTint: "#775544", segments: [image("top",1)] },
    { inventoryId: "bottom-yes", category: "bottom", colorPickerEnabled: true,
      colorTint: "#345678", segments: [image("left_leg",1), image("right_leg",2)] },
    { inventoryId: "bottom-no", category: "bottom", colorPickerEnabled: false,
      colorTint: "#345678", segments: [image("left_leg",1)] },
  ];
  const eligible = owned.map(item => ({
    ...item, quantity: 1, isListed: false, compatible: true,
  }));
  const equipped = [eligible[0],eligible[2]].map(item=>({...item}));
  const avatar = {
    created: true, base: {name:"Fem"}, ownedClothing:eligible, equipped,
    unavailableEquipmentSlots:[],
  } as any;
  const layers = wardrobeLayers(avatar);
  assert.equal(layers.find(x=>x.category==="top")?.colorTint,"#775544");
  assert.equal(layers.find(x=>x.category==="bottom")?.colorTint,"#345678");
  assert.equal(layers.find(x=>x.category==="top")?.segments.length,3);
  assert.equal(layers.find(x=>x.category==="bottom")?.segments.length,2);
  const disabled = {
    ...avatar, equipped: [eligible[1],eligible[3]],
  };
  const original = wardrobeLayers(disabled);
  assert.equal(original.find(x=>x.category==="top")?.colorTint,null);
  assert.equal(original.find(x=>x.category==="bottom")?.colorTint,null);
  // A temporary unsaved preview can never inherit an unrelated equipped
  // item's color merely because the slot/category matches.
  const preview = wardrobeLayers(avatar,
    {category:"top",inventoryId:"top-no"}, false, "Fem", () => true);
  assert.equal(preview.find(x=>x.category==="top")?.colorTint,null);
  assert.equal(preview.find(x=>x.category==="bottom")?.colorTint,"#345678");
});

test("admin may save per-item color flags with one published Fem/Masc clothing SKU", () => {
  const item = {
    name:"Forest Blouse",category:"top",price:0,
    images:[],keep:[],
    colorPickerEnabled:true,
    bodyVariants:{
      fem:{images:[{slot:"piece_1",partType:"top",imageData:"data:image/png;base64,aGVsbG8="}],keep:[]},
      masc:{images:[{slot:"piece_1",partType:"top",imageData:"data:image/png;base64,aGVsbG8="}],keep:[]},
    },
  };
  assert.equal(saveUniversalClothingItemSchema.safeParse(item).success,true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({...item,colorPickerEnabled:false}).success,true);
  assert.equal(saveUniversalClothingItemSchema.safeParse({...item,colorPickerEnabled:"on"}).success,false);
  const server=read("server/routes/playerClothingAdmin.routes.ts");
  const ui=read("client/src/components/PlayerClothingAdminPanel.tsx");
  assert.match(server,/input\.data\.colorPickerEnabled \?\? existing\?\.colorPickerEnabled \?\? false/);
  assert.match(ui,/data-testid="avatar-clothing-color-picker-enabled"/);
  assert.match(ui,/checked=\{colorPickerEnabled\}/);
  assert.match(ui,/setColorPickerEnabled\(draft\.category === "hair"/);
  assert.match(ui,/previewClothingTint=\{category === "hair" \|\| colorPickerEnabled \? previewTint : null\}/);
  assert.match(ui,/data-testid="avatar-clothing-color-preview-controls"/);
});

test("top/bottom color group applies one matrix after all segment alpha and motion are composed", () => {
  const renderer=read("client/src/components/PlayerCharacterRenderer.tsx");
  const css=read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(renderer,/compositedGarments/);
  assert.match(renderer,/layer\.category === "top" \|\| layer\.category === "bottom"/);
  assert.match(renderer,/new Set\(compositedGarments\.map\(item => item\.itemKey\)\)/);
  assert.match(renderer,/data-testid="avatar-clothing-composite"/);
  assert.match(renderer,/filter: tintFilter\(garment\.color\)/);
  assert.match(renderer,/garment\.pieces\.map\(piece => renderClothingPiece\(piece, true\)\)/);
  assert.equal((renderer.match(/filter: grouped \? undefined : tintFilter\(layer\.colorTint\)/g)??[]).length,2);
  assert.match(renderer,/data-character-motion-part=\{layer\.segment\.partType\}/);
  assert.match(css,/\.player-character-renderer__garment-composite \{/);
  assert.match(css,/isolation: isolate;/);
  assert.doesNotMatch(renderer,/maskImage:|WebkitMaskImage:|mix-blend-mode/);
  assert.equal(clothingLayerDepth("top",undefined,"under",false),75);
  assert.equal(clothingLayerDepth("top",undefined,"under",true),45);
  assert.equal(clothingLayerDepth("bottom"),55);
  assert.equal(clothingLayerDepth("shoes",undefined,"under"),35);
  assert.equal(clothingLayerDepth("shoes",undefined,"over"),65);
});
