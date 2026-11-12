import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields, parkOutdoorLightRadius } from "../shared/petParkAtmosphere";
import { isNightInteriorArtworkActive, getParkFireflyStrength, getParkLampStrength } from "../client/src/lib/homeOutdoorLighting";
import { parkSceneLampMaskChannel, parkSceneFireflyMaskChannel } from "../client/src/lib/parkSceneLighting";

const src=(path:string)=>readFileSync(path,"utf8");

test("World building and decor forms keep every tool but fold optional sections",()=>{
  const c=src("client/src/components/world-editor/WorldSceneCreateForm.tsx");
  for(const key of ["world-create-legacy-options","world-create-shop-options","world-create-building-effects",
    "world-create-interior-artwork","world-create-decor-tap-image","world-create-decor-effects",
    "world-create-decor-behavior"]) assert.match(c,new RegExp(key));
  for(const field of ["Building Name","Building starting size","Building interior image",
    "New world nighttime interior image","Decoration Tap Image",
    "WorldDecorEffectEditor","button-create-world-building","button-create-world-decoration"])
    assert.ok(c.includes(field),field+" is still available");
  assert.match(c,/onCreated\(placed, inside\)/);
  const roles = src("client/src/components/DecorSurfaceSelector.tsx");
  for(const label of ["Barrier","Grass","Ground","Water Source"])
    assert.match(roles,new RegExp(`label: "${label}"`));
});
test("building/decor editing keeps placement, stock, page and lighting actions",()=>{
  const c=src("client/src/components/world-editor/WorldSceneControls.tsx");
  for(const key of ["world-edit-decor-effects","world-decoration-tap-image-editor",
    "world-edit-building-page","world-edit-building-effects","world-edit-building-artwork",
    "world-water-effect-options"])assert.ok(c.includes(key));
  for(const key of ["Enter Building","Shop Setup","Add world effects","Duplicate",
    "WorldLegacyPagePicker","onInteriorDarknessCommit","onInteriorPreviewClockChange",
    "patchInterior","world-editor-interior-darkness-slider"])assert.ok(c.includes(key),key);
  assert.ok(!c.includes("390×844"));
});
test("interior colored lamps use the same darkness cutouts as indoor lamp lights",()=>{
  const s=src("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(s,/item\.effectType === "colored_light"/);
  assert.match(s,/type: \(item\.effectType === "colored_light" \? "lamp_light"/);
  assert.match(s,/<HomeInteriorDarknessLayer/);
});
test("World and Pet Park lights and fireflies retain aligned size and scene coordinates",()=>{
  const scene={width:1000,height:1000,scale:1};
  const fields=[{id:"house",kind:"building",xPct:.45,yPct:.55,size:200,flipped:false,
    decorEffects:[{id:"porch",type:"lamp_light" as const,x:.75,y:.35,size:40},
      {id:"swarm",type:"fireflies" as const,x:.4,y:.45,size:70}]}];
  const lights=parkOutdoorLightEffects(fields,scene,{x:0,y:0},{width:600,height:800});
  const fireflies=parkOutdoorFireflyFields(fields,scene,{x:0,y:0},{width:600,height:800});
  assert.equal(lights[0].id,"house-porch");
  assert.equal(fireflies[0].id,"house-swarm");
  assert.ok(lights[0].x>.45&&lights[0].y<.55);
  assert.ok(parkOutdoorLightRadius(lights[0],scene.height,true)>0);
  assert.ok(parkSceneLampMaskChannel(1,1)<255);
  assert.ok(parkSceneFireflyMaskChannel(1,1)<255);
  const local=(h:number)=>new Date(2026,10,12,h,0);
  assert.equal(getParkFireflyStrength("auto",local(6)),0);
  assert.equal(getParkLampStrength("auto",local(6)),0);
  assert.equal(isNightInteriorArtworkActive("auto",local(6)),false);
});
