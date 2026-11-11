import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PLAYER_CLOTHING_CATEGORIES,
  PLAYER_CLOTHING_UPLOAD_SLOTS,
  PLAYER_CLOTHING_CATEGORY_LABELS,
  PLAYER_CLOTHING_DEFAULT_ATTACHMENTS,
  clothingSlotPartType,
  clothingLayerDepth,
  canvasClothingFit,
  playerClothingDefinitionSchema,
  type PlayerClothingSegment,
} from "../shared/playerCharacterClothing";
import {
  clothingCanvasWriteSchema,
  upsertClothingSegment,
} from "../shared/playerClothingAdmin";

const read = (path:string) => readFileSync(path,"utf8");
const image = (partType:PlayerClothingSegment["partType"],slot:NonNullable<PlayerClothingSegment["slot"]>,n:number):PlayerClothingSegment => ({
  partType,slot,canvasAligned:true,
  imageUrl:`/api/media/00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,
  fit:canvasClothingFit(),renderPlane:"with_part",
});

test("wardrobe categories and drawing depths match the specified back-to-front hierarchy",()=>{
  assert.deepEqual(PLAYER_CLOTHING_CATEGORIES,[
    "accessories","head","hair","face","top","bottom","shoes","back",
  ]);
  assert.equal(PLAYER_CLOTHING_CATEGORY_LABELS.head,"Head Accessories");
  const back=clothingLayerDepth("back","top");
  const backHair=clothingLayerDepth("hair","hair_back");
  const shoe=clothingLayerDepth("shoes","left_foot");
  const bottom=clothingLayerDepth("bottom","left_leg");
  const top=clothingLayerDepth("top","top");
  const face=clothingLayerDepth("face","face_open_eyes");
  const hair=clothingLayerDepth("hair","hair_front");
  const head=clothingLayerDepth("head","head");
  const accessories=clothingLayerDepth("accessories","top");
  assert.ok(back<backHair && backHair<shoe && shoe<bottom &&
    bottom<top && top<face && face<hair && hair<head && head<accessories);
  assert.ok(backHair<10,"back hair is behind every base part");
});

test("hair and face can contain multiple same-head images without collapsing their slots",()=>{
  const hairFront=image("head","hair_front",1);
  const hairBack=image("head","hair_back",2);
  const hair=playerClothingDefinitionSchema.parse({
    name:"Woodland Hair",category:"hair",segments:[hairFront,hairBack],
  });
  assert.equal(hair.segments.length,2);
  assert.deepEqual(PLAYER_CLOTHING_UPLOAD_SLOTS.hair,["hair_front","hair_back"]);
  const face = [
    image("head","face_open_eyes",3),
    image("head","face_closed_eyes",4),
    image("head","face_mouth",5),
  ];
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Face",category:"face",segments:face,
  }).success,true);
  assert.deepEqual(PLAYER_CLOTHING_UPLOAD_SLOTS.face,
    ["face_open_eyes","face_closed_eyes","face_mouth"]);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Duplicate Eye",category:"face",segments:[face[0],face[0]],
  }).success,false);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Wrong Attachment",category:"face",segments:[
      {...face[0],partType:"top"},
    ],
  }).success,false);
  const replaced=upsertClothingSegment([face[0],face[1],face[2]],{
    ...face[0],imageUrl:image("head","face_open_eyes",6).imageUrl,
  });
  assert.equal(replaced.length,3);
  assert.equal(replaced.find(x=>x.slot==="face_closed_eyes")?.imageUrl,face[1].imageUrl);
});

test("a shirt keeps torso and both arm canvases independently with no size or offsets",()=>{
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.top,["top","left_arm","right_arm"]);
  const slots=PLAYER_CLOTHING_UPLOAD_SLOTS.top;
  assert.deepEqual(slots,["top","left_arm","right_arm"]);
  const segments=slots.map((slot,index)=>image(clothingSlotPartType(slot),slot,index+1));
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Three Piece Blouse",category:"top",segments,
  }).success,true);
  assert.equal(new Set(segments.map(part=>part.partType)).size,3);
  for(const segment of segments){
    assert.deepEqual(segment.fit,{
      xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:1,
    });
  }
});

test("server validates multi-upload batches without duplicated slots or oversize data",()=>{
  const okay={expectedRevision:4,images:[
    {slot:"top" as const,imageData:"data:image/png;base64,aGVsbG8="},
    {slot:"left_arm" as const,imageData:"data:image/webp;base64,aGVsbG8="},
    {slot:"right_arm" as const,imageData:"data:image/png;base64,aGVsbG8="},
  ],removeSlots:[]};
  assert.equal(clothingCanvasWriteSchema.safeParse(okay).success,true);
  assert.equal(clothingCanvasWriteSchema.safeParse({
    ...okay,images:[okay.images[0],okay.images[0]],
  }).success,false);
  assert.equal(clothingCanvasWriteSchema.safeParse({
    ...okay,removeSlots:["top"],
  }).success,false);
  assert.equal(clothingCanvasWriteSchema.safeParse({
    ...okay,images:[{slot:"face_open_eyes",imageData:"data:image/svg+xml;base64,AAAA"}],
  }).success,false);
  assert.equal(clothingCanvasWriteSchema.safeParse({
    ...okay,images:[],removeSlots:[],
  }).success,true,"Existing drafts may be normalized without replacing images");
});

test("admin and renderer actually use shared canvas images rather than local drag fit",()=>{
  const component=read("client/src/components/PlayerClothingAdminPanel.tsx");
  const renderer=read("client/src/components/PlayerCharacterRenderer.tsx");
  const css=read("client/src/components/PlayerCharacterRenderer.css");
  const route=read("server/routes/playerClothingAdmin.routes.ts");
  assert.match(component,/PLAYER_CLOTHING_UPLOAD_SLOTS\[selected.category\]/);
  assert.match(component,/onImageSelected\(slot,event.currentTarget.files\?\.\[0\]\)/);
  assert.match(component,/canvasClothingFit\(\)/);
  assert.match(component,/previewEyesClosed=\{previewClosedEyes\}/);
  assert.match(component,/avatar-save-clothing-artwork/);
  assert.match(component,/avatar-publish-clothing/);
  assert.doesNotMatch(component,/pointerToCharacterPartLocal|setPointerCapture|Horizontal fit|Vertical fit|Size \(%\)|Rotation \(°\)|Clothing depth|Save This Fitted Piece/);
  assert.match(renderer,/fullCanvas\.map\(layer =>/);
  assert.match(renderer,/clothingLayerDepth\(layer.category, layer.segment.slot\)/);
  assert.match(renderer,/data-clothing-slot/);
  assert.match(renderer,/player-character-renderer__canvas-image/);
  assert.match(css,/player-character-renderer__canvas-motion/);
  assert.match(css,/inset: 0/);
  assert.match(css,/width: 100%/);
  assert.match(css,/height: 100%/);
  assert.match(css,/player-character-renderer__eyes-closed/);
  const a=route.indexOf('app.put("/api/admin/player-character/clothing/:id/artwork", isAdmin');
  const b=route.indexOf('app.put("/api/admin/player-character/clothing/:id/segments/:partType"',a);
  assert.ok(a>=0 && b>a);
  const batch=route.slice(a,b);
  assert.match(batch,/clothingCanvasWriteSchema.safeParse/);
  assert.match(batch,/clothingSlotPartType\(image.slot\)/);
  assert.match(batch,/canvasClothingFit\(\)/);
  assert.match(batch,/eq\(playerClothingDrafts.revision, draft.revision\)/);
  assert.equal((batch.match(/db.update\(playerClothingDrafts\)/g)??[]).length,1);
  assert.doesNotMatch(batch,/publishedSegments:|shopItemId:|publishedAt: new Date/);
  assert.match(batch,/draftSegments,/);
  assert.equal((route.match(/segment.canvasAligned \|\| segment.slot/g)??[]).length,2,
    "Both legacy edit/delete routes must reject full-canvas multi-slot drafts");
});

test("existing clothing storage CHECK is migrated additively for eighth Accessories category",()=>{
  const migration=read("server/startup/migrations/ensurePlayerClothingStorage.ts");
  assert.match(migration,/CREATE TABLE IF NOT EXISTS player_clothing_drafts/);
  assert.match(migration,/CHECK \(category IN \('accessories','head','hair','face','top','bottom','shoes','back'\)\)/);
  assert.match(migration,/pg_constraint/);
  assert.match(migration,/pg_get_constraintdef\(oid\) NOT ILIKE '%accessories%'/);
  assert.match(migration,/DROP CONSTRAINT player_clothing_drafts_category_check/);
  assert.match(migration,/ADD CONSTRAINT player_clothing_drafts_category_check/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM player_clothing_drafts/);
  const equipment=read("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");
  assert.match(equipment,/CHECK \(category IN \('accessories','head','hair','face','top','bottom','shoes','back'\)\)/);
  assert.match(equipment,/DROP CONSTRAINT player_avatar_equipment_category_check/);
  assert.match(equipment,/ADD CONSTRAINT player_avatar_equipment_category_check/);
  assert.match(equipment,/pg_get_constraintdef\(oid\) NOT ILIKE '%accessories%'/);
  assert.doesNotMatch(equipment,/DROP TABLE|DELETE FROM player_avatar_equipment/);
});

test("Shoes offer an independent Over/Under Pants draw-order choice without resizing images",()=>{
  const below = clothingLayerDepth("shoes","left_foot","under");
  const above = clothingLayerDepth("shoes","left_foot","over");
  const pants = clothingLayerDepth("bottom","left_leg");
  const top = clothingLayerDepth("top","top");
  assert.ok(below < pants && pants < above && above < top);
  assert.equal(clothingLayerDepth("shoes"),below,"Existing shoes remain under pants");
  const under = [
    image("left_foot","left_foot",10),
    image("right_foot","right_foot",11),
  ];
  const over = under.map(part=>({...part,shoesLayer:"over" as const}));
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Tall Boots",category:"shoes",segments:over,
  }).success,true);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Low Shoes",category:"shoes",segments:under,
  }).success,true);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Mixed Settings",category:"shoes",segments:[under[0],over[1]],
  }).success,false,"All images in one pair of shoes must share one order");
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name:"Not Shoes",category:"bottom",segments:[{
      ...image("left_leg","left_leg",12),shoesLayer:"over",
    }],
  }).success,false);
  assert.deepEqual(over.map(part=>part.fit),under.map(part=>part.fit),
    "Layering does not alter the source canvas transforms");

  const admin = read("client/src/components/PlayerClothingAdminPanel.tsx");
  const server = read("server/routes/playerClothingAdmin.routes.ts");
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  assert.match(admin,/avatar-shoes-layer-control/);
  assert.match(admin,/avatar-shoes-.*-pants/);
  assert.match(admin,/shoesLayerDirty/);
  assert.match(admin,/selected.category === "shoes" \? \{ shoesLayer \}/);
  assert.match(server,/draft.category === "shoes"/);
  assert.match(server,/parsed.data.shoesLayer/);
  assert.match(server,/shoesLayer \}/);
  assert.match(renderer,/clothingLayerDepth\(layer.category, layer.segment.slot, layer.segment.shoesLayer\)/);
  assert.doesNotMatch(admin,/Shoes Width|Shoes X Position|Shoes Y Position/);
});
