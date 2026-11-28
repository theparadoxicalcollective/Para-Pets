import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import {
  canRotateWorldSceneKind, validWorldSceneRotation, stepWorldSceneRotation,
  worldSceneRotationCss, worldSceneRotatedSquareExtent, validPlacementTransform,
} from "../shared/worlds/worldSceneContent";
import { parkOutdoorLightEffects, parkOutdoorFireflyFields } from "../shared/petParkAtmosphere";
import { registerWorldSceneContentRoutes } from "../server/routes/worldSceneContent.routes";
import { worldScenePlacements, worldSceneInteriorItems, worldSceneAssets } from "../shared/schema";

test("precise bidirectional rotation wraps at 360, defaults older scenes to zero and validates degrees", () => {
  assert.equal(stepWorldSceneRotation(undefined,1),5);
  assert.equal(stepWorldSceneRotation(0,-1),355);
  assert.equal(stepWorldSceneRotation(355,1),0);
  assert.equal(stepWorldSceneRotation(5,-1),0);
  assert.equal(worldSceneRotationCss(undefined),"");
  assert.equal(worldSceneRotationCss(0),"");
  assert.equal(worldSceneRotationCss(25)," rotate(25deg)");
  assert.equal(worldSceneRotatedSquareExtent(100,0),100);
  assert.ok(Math.abs(worldSceneRotatedSquareExtent(100,45)-Math.sqrt(2)*100)<1e-9);
  const base={xPct:.3,yPct:.5,size:90,flipped:false,layer:0};
  assert.ok(validPlacementTransform(base));
  for (const value of [0,1,355,359]) assert.ok(validPlacementTransform({...base,rotation:value}));
  for (const value of [-1,360,12.5,NaN,Infinity,"5",null]) {
    assert.equal(validWorldSceneRotation(value),false);
    assert.equal(validPlacementTransform({...base,rotation:value}),false);
  }
  for (const kind of ["effect","terrain","npc"]) assert.equal(canRotateWorldSceneKind(kind),false);
  for (const kind of ["decor","building"]) assert.ok(canRotateWorldSceneKind(kind));
});

test("rotated and flipped attached lamps/fireflies follow artwork without changing strength or size", () => {
  const geometry={width:1000,height:800,scale:1};
  const item={id:"fence",kind:"decor",xPct:.5,yPct:.5,size:200,flipped:true,rotation:90,decorEffects:[
    {id:"lamp",type:"lamp_light" as const,x:.75,y:.5,size:25},
    {id:"firefly",type:"fireflies" as const,x:.5,y:.75,size:25},
  ]};
  const lights=parkOutdoorLightEffects([item],geometry,{x:0,y:0},geometry);
  const flies=parkOutdoorFireflyFields([item],geometry,{x:0,y:0},geometry);
  assert.equal(lights.length,1);
  assert.equal(flies.length,1);
  assert.ok(Math.abs(lights[0].x-.5)<1e-9&&Math.abs(lights[0].y-.4375)<1e-9);
  assert.ok(Math.abs(flies[0].x-.45)<1e-9&&Math.abs(flies[0].y-.5)<1e-9);
  assert.equal(lights[0].size,6.25);
  assert.equal(flies[0].size,6.25);
});

const id="10000000-0000-4000-8000-000000000001";
// Actual route handlers, with an isolated DB double to inspect writes. This
// verifies the authorization registration and server's payload validation,
// rather than relying on the browser fixture accepting every PATCH.
function setup(kind="decor"){
  const row={id,kind,assetId:id,rotation:0,flipped:true,size:240,xPct:.3,yPct:.4};
  const writes: any[]=[];
  const admin:RequestHandler=(_req,_res,next)=>next();
  const routes=new Map<string,RequestHandler[]>();
  const app=Object.fromEntries(["get","post","patch","put","delete"].map(method=>[method,(path:string,...handlers:RequestHandler[])=>{routes.set(method+" "+path,handlers);}]));
  const db={
    select(fields?:any){return {from(table:unknown){return {where(){
      const result=fields?.total ? [{total:1}] : fields?.id ? [{id}] : fields?.isWaterSource ? [] : table===worldSceneAssets ? [{id,kind:"decor"}] : [row];
      return Object.assign(Promise.resolve(result),{limit:()=>Promise.resolve(result),orderBy:()=>({limit:()=>Promise.resolve(result)})});
    }}}}},
    update(table:unknown){return {set(changes:unknown){writes.push({table,changes});return {where:()=>({returning:async()=>[{...row,...changes as object}]})}}}},
    insert(table:unknown){return {values(values:unknown){writes.push({table,values});return {returning:async()=>[{...row,...values as object}]}}}},
    async transaction(fn:(tx:any)=>Promise<unknown>){return fn(db);},
  };
  registerWorldSceneContentRoutes(app as any,{db:db as any,isAdmin:admin,processWorldImage:async()=>"/unused"});
  const invoke=async(method:string,route:string,body:unknown)=>{
    const handlers=routes.get(method+" /api/admin/world-editor/:worldId/"+route)!;
    assert.equal(handlers[0],admin);
    const res={statusCode:200,body:undefined as any,status(n:number){this.statusCode=n;return this;},json(value:unknown){this.body=value;return this;}};
    await (handlers.at(-1) as any)({body,params:{worldId:"swamp",placementId:id,itemId:id}},res);
    return res;
  };
  return {invoke,writes};
}
test("admin rotation PATCH persists only the selected placement and rejects invalid or non-artwork angles",async()=>{
  for (const kind of ["decor","building","npc","effect","terrain"]){
    const {invoke,writes}=setup(kind);
    const result=await invoke("patch","placements/:placementId",{rotation:355});
    if (canRotateWorldSceneKind(kind)){
      assert.equal(result.statusCode,200);
      assert.equal(result.body.rotation,355);
      assert.deepEqual(writes,[{table:worldScenePlacements,changes:{rotation:355}}]);
    }else{assert.equal(result.statusCode,400);assert.equal(writes.length,0);}
  }
  for(const endpoint of ["placements/:placementId","interior-items/:itemId"]){
    const {invoke,writes}=setup();
    for(const bad of [-1,360,1.5,"15",null]){
      assert.equal((await invoke("patch",endpoint,{rotation:bad})).statusCode,400);
    }
    assert.equal(writes.length,0);
    assert.equal((await invoke("patch",endpoint,{rotation:0})).body.rotation,0);
    assert.deepEqual(writes,[{table:endpoint.startsWith("placements")?worldScenePlacements:worldSceneInteriorItems,changes:{rotation:0}}]);
  }
  const effect=setup("effect");
  assert.equal((await effect.invoke("patch","interior-items/:itemId",{rotation:5})).statusCode,400);
  assert.equal(effect.writes.length,0);
});

test("new and duplicate decorations keep per-placement angle, omitted rotation defaults to zero",async()=>{
  const body={kind:"decor",assetId:id,xPct:.25,yPct:.25,size:150,flipped:true,layer:0,decorEffects:[],shopItemIds:[]};
  for(const rotation of [undefined,35]){
    const outside=setup();
    const result=await outside.invoke("post","placements",{...body,rotation});
    assert.equal(result.statusCode,201);
    assert.equal(result.body.rotation,rotation??0);
    assert.equal(outside.writes[0].values.rotation,rotation??0);
    const inside=setup("building");
    const interior=await inside.invoke("post","interior-items",{...body,buildingId:id,rotation});
    assert.equal(interior.statusCode,201);
    assert.equal(interior.body.rotation,rotation??0);
    assert.equal(inside.writes[0].values.rotation,rotation??0);
  }
  const migration=readFileSync("server/startup/migrations/ensureWorldSceneContentStorage.ts","utf8");
  for(const table of ["world_scene_placements","world_scene_interior_items"]){
    assert.match(migration,new RegExp("ALTER TABLE "+table+" ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0\\s+CHECK \\(rotation BETWEEN 0 AND 359\\)"));
  }
});
