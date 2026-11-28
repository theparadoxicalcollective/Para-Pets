import assert from "node:assert/strict";
import sharp from "sharp";
import { createServer } from "vite";
import { chromium, webkit } from "playwright";

// Real terrain and lighting components, with a large authored scene and no
// account or backend. Compare the existing full raster to the cached version.
const fixtureId = "/__world-scene-raster-fixture.tsx";
const fixture = `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import PetParkTerrain from "@/components/PetParkTerrain";
import {HomeOutdoorAtmosphereLayer} from "@/components/HomeOutdoorAtmosphere";
import {parkSceneDarkness} from "@/lib/parkSceneLighting";
import {MiniPetArtwork,SceneCharacterMotionStyles,sceneNpcIdleClass} from "@/components/MiniPetRenderer";
import "@/index.css";
const width=innerWidth,height=innerHeight, worldWidth=5400, worldHeight=8100;
const art="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="35" fill="#cfb75a"/></svg>');
const miniPet={shopItemId:"test",name:"Wisp",imageUrl:art,animationStyle:"breath",parts:[
  {id:"body",partType:"body",imageUrl:art},{id:"eyes",partType:"eyes",imageUrl:art},{id:"closed",partType:"closed_eyes",imageUrl:art}]};
const paths=[[],[],[]];
for(let row=0;row<32;row++) for(let col=0;col<20;col++){
  paths[Math.floor(col/7)].push({xPct:(col*100+900+(row%2)*50)/worldWidth,yPct:(row*25+1200)/worldHeight,size:100});
}
const lamps=[{id:"a",type:"lamp_light",x:(720+width/2)/3240,y:(900+height/2)/4860,size:5},
  {id:"b",type:"lamp_light",x:(720+width+35)/3240,y:(900+height/2)/4860,size:5}];
function Fixture(){
 const [state,setState]=useState({mode:"direct",panX:-720,panY:-900,scale:.6,revision:0});
 window.setRasterState=patch=>setState(s=>({...s,...patch}));
 const {mode,panX,panY,scale,revision}=state;
 const cell=96, x=-Math.floor(panX/cell)*cell-cell,y=-Math.floor(panY/cell)*cell-cell;
 return <div data-testid="raster-fixture" data-mode={mode} data-pan={panX} data-revision={revision}
 style={{position:"absolute",inset:0,overflow:"hidden",background:"#91be9d"}}>
 {mode==="characters"?<><SceneCharacterMotionStyles/>
   <div data-testid="npc-placement" style={{position:"absolute",left:20,top:100,width:100,height:100}}>
     <img className={sceneNpcIdleClass("float")} src={art} style={{width:"100%",height:"100%"}}/>
   </div>
   <div data-testid="mini-pet-placement" style={{position:"absolute",left:150,top:100,width:100,height:100}}>
     <MiniPetArtwork pet={miniPet} scene placementId="webkit" idleAnimation="breath"/>
   </div>
 </>:mode.startsWith("mask") ? <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(1)}
   nightStrength={1} lampStrength={1} effects={lamps} panX={panX} panY={panY} imgWidth={3240} sceneHeight={4860}
   sceneWindow={mode==="mask-window"?{x,y,width:width+2*cell,height:height+2*cell}:undefined}
   transitionMs={0} zIndex={2}/> :
 <PetParkTerrain viewportWidth={width} viewportHeight={height} worldWidth={worldWidth} worldHeight={worldHeight}
   scale={scale} panX={panX} panY={panY} groundTheme={revision?"swamp":"grass"} cacheRasterTiles={mode==="cached"}
   dirtPatches={paths[0]} stonePatches={paths[1]} waterPatches={paths[2]}/>}
 </div>
}
createRoot(document.getElementById("root")).render(<Fixture/>);
`;
const server=await createServer({server:{host:"127.0.0.1",port:4291,strictPort:true},plugins:[{
 name:"world-scene-raster-fixture",
 resolveId(id){return id===fixtureId?id:null;},
 load(id){return id===fixtureId?fixture:null;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(!req.headers.accept?.includes("text/html")) return next();
   res.setHeader("Content-Type","text/html");
   res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
 });}
}]});
await server.listen();
const engine=process.env.SCENE_LIGHT_BROWSER==="webkit"?webkit:chromium;
const browser=await engine.launch({headless:true});
async function diff(a,b){
 const [aPixels,bPixels]=await Promise.all([a,b].map(p=>sharp(p).removeAlpha().raw().toBuffer()));
 assert.equal(aPixels.length,bPixels.length);
 let sum=0, large=0;
 for(let i=0;i<aPixels.length;i++){const d=Math.abs(aPixels[i]-bPixels[i]);sum+=d;if(d>24)large++;}
 return {mean:sum/aPixels.length,large:large/aPixels.length};
}
try{
 for(const [width,height] of [[390,844],[834,1194]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:4291/raster-fixture");
  const canvas=page.getByTestId("pet-park-painterly-terrain");
  const scene=page.getByTestId("raster-fixture");
  const snapshot=()=>scene.screenshot({animations:"disabled"});
  const set=async patch=>{
   await page.evaluate(p=>window.setRasterState(p),patch);
   if(patch.mode) await page.waitForFunction(m=>document.querySelector('[data-testid="raster-fixture"]')?.dataset.mode===m,patch.mode);
   if(patch.panX!==undefined) await page.waitForFunction(x=>document.querySelector('[data-testid="raster-fixture"]')?.dataset.pan===String(x),patch.panX);
   // Wait for debounce and the actual painted canvas, not just React's state.
   await page.waitForTimeout(250);
   if(await canvas.count()) await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.parkCameraPreview==="false");
  };
  await canvas.waitFor();
  await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.parkWaterTexture==="ready");
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.parkCameraPreview==="false");
  const original=await snapshot();
  await set({mode:"cached"});
  const initial=await canvas.evaluate(c=>({hits:+c.dataset.parkTerrainTileHits,misses:+c.dataset.parkTerrainTileMisses}));
  assert.ok(initial.misses>0&&initial.hits===0);
  const terrainDiff=await diff(original,await snapshot());
  assert.ok(terrainDiff.mean<3&&terrainDiff.large<.025,JSON.stringify(terrainDiff));
  await set({panX:-940});
  const moved=await canvas.evaluate(c=>({hits:+c.dataset.parkTerrainTileHits,misses:+c.dataset.parkTerrainTileMisses}));
  assert.ok(moved.hits>0&&moved.misses>0,JSON.stringify(moved));
  const movedCached=await snapshot();
  await set({panX:-720});
  const returned=await canvas.evaluate(c=>({hits:+c.dataset.parkTerrainTileHits,misses:+c.dataset.parkTerrainTileMisses}));
  // One extra column on a tablet may exceed the bounded LRU by a tile.
  assert.ok(returned.hits>=initial.misses-1 && returned.misses<=1,JSON.stringify(returned));
  await set({revision:1});
  assert.equal(await canvas.getAttribute("data-park-terrain-tile-hits"),"0");
  await set({mode:"direct",revision:0,panX:-940});
  const movedDiff=await diff(movedCached,await snapshot());
  assert.ok(movedDiff.mean<3&&movedDiff.large<.025,JSON.stringify(movedDiff));
  // The original pan places most water offscreen on a phone. Move the
  // actual connected water union into view, then compare the direct editor
  // raster with the published-world cache on both mobile viewport sizes.
  await set({mode:"direct",panX:-1320,panY:-650});
  const waterDirect=await snapshot();
  const {data,info}=await sharp(waterDirect).removeAlpha().raw().toBuffer({resolveWithObject:true});
  // Inspect a central area within the connected water, away from the banks.
  let deep=0,reflections=0,samples=0;
  for(let y=110;y<380;y+=2) for(let x=100;x<320;x+=2){
    const i=(Math.floor(y*info.height/height)*info.width+Math.floor(x*info.width/width))*info.channels;
    const [r,g,b]=[data[i],data[i+1],data[i+2]];
    if(g<65&&b<90&&b>r+25) deep++;
    if(g>105&&b>110&&Math.min(g,b)>r+35) reflections++;
    samples++;
  }
  assert.ok(deep>samples*.08&&reflections>samples*.005,JSON.stringify({deep,reflections,samples}));
  await set({mode:"cached"});
  const waterDiff=await diff(waterDirect,await snapshot());
  assert.ok(waterDiff.mean<3&&waterDiff.large<.025,JSON.stringify(waterDiff));
  // Restore the original lighting camera for the existing mask regressions.
  await set({mode:"mask-full",panX:-720,panY:-900});
  const fullMask=await snapshot();
  await set({mode:"mask-window"});
  const mask=page.getByTestId("home-outdoor-darkness-layer");
  const box=await mask.boundingBox();
  assert.ok(box.width<=width+192&&box.height<=height+192,JSON.stringify(box));
  const maskDiff=await diff(fullMask,await snapshot());
  assert.ok(maskDiff.mean<1&&maskDiff.large<.005,JSON.stringify(maskDiff));
  await set({panX:-940});
  const pannedMask=await snapshot();
  await set({mode:"mask-full"});
  const panMaskDiff=await diff(pannedMask,await snapshot());
  assert.ok(panMaskDiff.mean<1&&panMaskDiff.large<.005,JSON.stringify(panMaskDiff));
  // Check the real shared motion in WebKit as well as Chromium, without
  // changing the existing terrain and lighting pixel comparisons.
  await set({mode:"characters"});
  const mini=page.getByTestId("mini-pet-placement");
  const tapTarget=await mini.boundingBox();
  const body=mini.locator(".scene-mini-pet-bounce");
  const animateAt=async(locator,fraction)=>{
   await locator.evaluate((el,fraction)=>{
    const animation=el.getAnimations()[0];
    if(!animation)throw new Error("Missing character CSS animation");
    const timing=animation.effect.getTiming();
    animation.pause();
    animation.currentTime=timing.delay+Number(timing.duration)*(2+fraction);
   },fraction);
  };
  await animateAt(body,0);
  const originalBody=await body.boundingBox();
  await animateAt(body,.45);
  const movedBody=await body.boundingBox();
  assert.ok(movedBody.x-originalBody.x>8&&movedBody.x-originalBody.x<15,"bounded lateral movement");
  assert.deepEqual(await mini.boundingBox(),tapTarget,"idle doesn't move the stored placement");
  const open=mini.locator(".mini-pet-eyes-open"),closed=mini.locator(".mini-pet-eyes-closed");
  await animateAt(open,.46); await animateAt(closed,.46);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector(".mini-pet-eyes-open")).opacity==="0"&&getComputedStyle(document.querySelector(".mini-pet-eyes-closed")).opacity==="1");
  await animateAt(open,.6); await animateAt(closed,.6);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector(".mini-pet-eyes-open")).opacity==="1"&&getComputedStyle(document.querySelector(".mini-pet-eyes-closed")).opacity==="0");
  const npc=page.getByTestId("npc-placement");
  const npcAnchor=await npc.boundingBox();
  const npcVisual=npc.locator(".scene-npc-float");
  await animateAt(npcVisual,.5);
  assert.ok((await npcVisual.boundingBox()).y<npcAnchor.y-3,"NPC floats inside stable interaction target");
  assert.deepEqual(await npc.boundingBox(),npcAnchor);
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.equal(await body.evaluate(el=>getComputedStyle(el).animationName),"none");
  assert.equal(await npcVisual.evaluate(el=>getComputedStyle(el).animationName),"none");
  assert.deepEqual(errors,[]);
  console.log("PASS",width,height,{initial,moved,returned,terrainDiff,movedDiff,waterDiff,maskDiff,panMaskDiff});
  await context.close();
 }
}finally{await browser.close();await server.close();}
