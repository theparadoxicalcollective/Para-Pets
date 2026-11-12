import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isDecorSurface, decorRole, decorRoleUpdate, decorAllowsWalking,
  decorDrawDepth, decorBlocksWorldPoint,
} from "../shared/decorSurface";

const read=(p:string)=>readFileSync(p,"utf8");

test("legacy decorations default to barrier; old water-source refills are preserved", () => {
  assert.equal(decorRole({}), "barrier");
  assert.equal(decorRole({isWaterSource:true}), "water");
  for (const role of ["barrier","grass","ground"] as const)
    assert.equal(isDecorSurface(role),true);
  assert.equal(isDecorSurface("water"),false);
  assert.equal(isDecorSurface("roof"),false);
  assert.deepEqual(decorRoleUpdate("barrier"),{isWaterSource:false,decorSurface:"barrier"});
  assert.deepEqual(decorRoleUpdate("grass"),{isWaterSource:false,decorSurface:"grass"});
  assert.deepEqual(decorRoleUpdate("ground"),{isWaterSource:false,decorSurface:"ground"});
  assert.deepEqual(decorRoleUpdate("water"),{isWaterSource:true,decorSurface:"barrier"});
});

test("only grass and ground allow walking, independently of transparent alpha", () => {
  assert.equal(decorAllowsWalking({decorSurface:"grass"}),true);
  assert.equal(decorAllowsWalking({decorSurface:"ground"}),true);
  assert.equal(decorAllowsWalking({decorSurface:"barrier"}),false);
  assert.equal(decorAllowsWalking({isWaterSource:true,decorSurface:"ground"}),false);
  const item={xPct:.4,yPct:.5,size:100,decorSurface:"barrier" as const};
  const world={width:1000,height:800,scale:1};
  // A 100px square centered at (400,400) contains this feet position.
  assert.equal(decorBlocksWorldPoint(item,{xPct:.4,yPct:.5},world,()=>true),true);
  // Transparent PNG pixels and holes do not block (even inside bounding box).
  assert.equal(decorBlocksWorldPoint(item,{xPct:.4,yPct:.5},world,()=>false),false);
  // Transparent padding beyond the art square never blocks movement.
  assert.equal(decorBlocksWorldPoint(item,{xPct:.52,yPct:.5},world,()=>true),false);
  assert.equal(decorBlocksWorldPoint({...item,decorSurface:"grass"},{xPct:.4,yPct:.5},world,()=>true),false);
  assert.equal(decorBlocksWorldPoint({...item,decorSurface:"ground"},{xPct:.4,yPct:.5},world,()=>true),false);
  assert.equal(decorBlocksWorldPoint({...item,isWaterSource:true},{xPct:.4,yPct:.5},world,()=>true),true);
  assert.equal(decorBlocksWorldPoint(item,{xPct:.4,yPct:.5},{...world,scale:0},()=>true),false);
});

test("Ground art sits over terrain but under normal scenery on both editors", () => {
  assert.equal(decorDrawDepth({decorSurface:"ground"},5_400_000,650),650);
  assert.equal(decorDrawDepth({decorSurface:"ground"},5_400_000,2),2);
  assert.equal(decorDrawDepth({decorSurface:"grass"},5_400_000,650),5_400_000);
  assert.equal(decorDrawDepth({},5_400_000,650),5_400_000);
  const park=read("client/src/pages/PetParkPage.tsx");
  const world=read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(park,/item\.kind === "terrain" \? 500 : decorDrawDepth\(item,/);
  assert.match(world,/p\.kind === "terrain" \? 1 : decorDrawDepth\(p,/);
  assert.match(park,/data-decor-role=\{item\.kind === "decor" \? decorRole\(item\)/);
  assert.match(world,/data-decor-role=\{p\.kind === "decor" \? decorRole\(p\)/);
});

test("both editors expose single-choice legible controls and save their roles", () => {
  const ui=read("client/src/components/DecorSurfaceSelector.tsx");
  const parkAdmin=read("client/src/components/PetParkAdminPanel.tsx");
  const park=read("client/src/pages/PetParkPage.tsx");
  const world=read("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.match(ui,/<fieldset/);
  assert.match(ui,/type="radio"/);
  for (const label of ["Barrier","Grass","Ground","Water Source"]) assert.ok(ui.includes(label));
  assert.match(ui,/h-5 w-5/);
  assert.match(ui,/text-xs leading-snug/);
  assert.match(parkAdmin,/testId="park-new-decor-behavior"/);
  assert.match(park,/testId="park-decoration-behavior"/);
  assert.match(world,/testId="world-decoration-behavior"/);
  assert.match(park,/api\/admin\/pet-park\/items\/\$\{id\}\/surface/);
  assert.match(world,/onChange=\{role => void changeDecorRole\(role\)\}/);
  assert.match(world,/pendingDecorRole\?\.id === props\.selected\.id/);
  assert.match(world,/setPendingDecorRole\(\{ id: selectedId, role \}\)/);
  assert.match(world,/decorSurface: source\.decorSurface/);
});

test("backend shares each decor type role across linked copies and validates one role at a time", () => {
  const schema=read("shared/schema.ts");
  const parkRoute=read("server/routes/petParkAdmin.routes.ts");
  const worldRoute=read("server/routes/worldSceneContent.routes.ts");
  const parkMigration=read("server/startup/migrations/ensurePetParkStorage.ts");
  const worldMigration=read("server/startup/migrations/ensureWorldSceneContentStorage.ts");
  assert.ok((schema.match(/decorSurface: text\("decor_surface"\)/g)??[]).length===2);
  assert.match(parkMigration,/ADD COLUMN IF NOT EXISTS decor_surface text NOT NULL DEFAULT 'barrier'/);
  assert.match(worldMigration,/ADD COLUMN IF NOT EXISTS decor_surface text NOT NULL DEFAULT 'barrier'/);
  assert.match(parkRoute,/app\.patch\("\/api\/admin\/pet-park\/items\/:id\/surface", isAdmin/);
  assert.match(parkRoute,/isDecorSurface\(decorSurface\)/);
  assert.match(parkRoute,/decorSurface: original\.decorSurface/);
  assert.match(parkRoute,/const groupId = original\.appearanceGroupId \?\? original\.id/);
  assert.match(parkRoute,/set\(\{ appearanceGroupId: groupId \}\)/);
  const surfaceRoute = parkRoute.split('app.patch("/api/admin/pet-park/items/:id/surface"')[1]
    ?.split('app.patch("/api/admin/pet-park/items/:id/water-source"')[0] ?? "";
  assert.match(surfaceRoute,/decorAppearanceWhere\(original\)/);
  assert.match(surfaceRoute,/set\(\{ decorSurface, isWaterSource \}\)/);
  const waterRoute = parkRoute.split('app.patch("/api/admin/pet-park/items/:id/water-source"')[1]
    ?.split('app.patch("/api/admin/pet-park/items/:id/color"')[0] ?? "";
  assert.match(waterRoute,/decorAppearanceWhere\(original\)/);
  assert.match(worldRoute,/isDecorSurface\(decorSurface\)/);
  assert.match(worldRoute,/decorEffects, isWaterSource: sameType\?\.isWaterSource \?\? isWaterSource/);
  assert.match(worldRoute,/changes\.decorSurface = body\.decorSurface/);
  assert.match(worldRoute,/const \[sameType\] = kind === "decor"/);
  assert.match(worldRoute,/isWaterSource: sameType\?\.isWaterSource \?\? isWaterSource/);
  assert.match(worldRoute,/decorSurface: sameType\?\.decorSurface \?\? decorSurface/);
  assert.match(worldRoute,/eq\(worldScenePlacements\.assetId, saved\.assetId\)/);
  assert.match(worldRoute,/decorSurface: placed\.decorSurface, isWaterSource: placed\.isWaterSource/);
  assert.match(worldRoute,/eq\(worldScenePlacements\.worldId, worldId\)/);
  assert.match(read("client/src/components/DecorSurfaceSelector.tsx"),/All copies of the same decoration share this setting/);
  assert.match(parkRoute,/items\/:id\/water-source", isAdmin/);
  assert.match(worldRoute,/if \("isWaterSource" in body\)/);
});

test("opaque barrier checks reuse the existing per-pixel PNG sampler for park placement",()=>{
  const park=read("client/src/pages/PetParkPage.tsx");
  const alpha=read("client/src/lib/petParkImageHit.ts");
  assert.match(park,/outdoorPointBlockedByDecor/);
  assert.match(park,/return decorBlocksWorldPoint\(item, point,/);
  assert.match(park,/return parkImageHitAt\(image, rect\.left \+ x \* rect\.width,/);
  assert.match(alpha,/const MASK_SIZE = 96/);
  assert.match(alpha,/return mask\[pixelY \* MASK_SIZE \+ pixelX\] > ALPHA_THRESHOLD/);
});
