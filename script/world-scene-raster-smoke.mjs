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
import "@/index.css";
const width=innerWidth,height=innerHeight, worldWidth=5400, worldHeight=8100;
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
 {mode.startsWith("mask") ? <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(1)}
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
  await set({mode:"mask-full",panX:-720});
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
  assert.deepEqual(errors,[]);
  console.log("PASS",width,height,{initial,moved,returned,terrainDiff,movedDiff,maskDiff,panMaskDiff});
  await context.close();
 }
}finally{await browser.close();await server.close();}
