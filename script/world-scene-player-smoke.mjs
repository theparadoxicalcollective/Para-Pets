import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real player renderer, original location component and quest overlay.
// All requests are isolated fixtures; no production account or write routes.
const moduleId = "/__world-scene-player-fixture.tsx";
const fixture = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {useLocation,useSearch} from "wouter";
import {getQueryFn} from "@/lib/queryClient";
import WorldScenePlayerPage from "@/pages/WorldScenePlayerPage";
import WorldLocations from "@/components/world/WorldLocations";
import JansonQuestOverlay from "@/components/JansonQuestOverlay";
import WorldNpcPlacementOverlay from "@/components/WorldNpcPlacementOverlay";
import "@/index.css";
const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false}}});
window.refreshScene=()=>client.invalidateQueries({queryKey:["/api/worlds","swamp","player-scene"]});
const oldLocations=[{id:"old-shop",worldId:"swamp",name:"Original Shop",type:"shop",isShop:true,posX:35,posY:35,iconSize:100}];
function Fixture(){
 const [,navigate]=useLocation(), search=useSearch(), params=new URLSearchParams(search);
 const [opened,setOpened]=useState("");
 return <>{params.has("legacyLocationId")||params.has("legacyView")?
 <div data-testid="legacy-view" className="absolute inset-0">
  <WorldLocations locations={oldLocations} hiddenLocationIds={params.has("showRetired")?[]:["old-shop"]}
   worldId="swamp" accent="#daa" isAdmin={false} selectedLocationId={null} draggingLocationId={null}
   dragPosition={null} onPointerDown={()=>{}} onLocationClick={loc=>setOpened(loc.id)}
   linkedLocationId={params.get("legacyLocationId")} onLinkedLocationClick={loc=>setOpened(loc.id)}
   onEditLocation={()=>{}} onFlipLocation={()=>{}} onDeleteLocation={()=>{}} onResizeLocation={()=>{}} onDuplicateLocation={()=>{}}/>
   <span data-testid="opened-legacy">{opened}</span>
   <button data-testid="restore-visibility" className="absolute bottom-20 z-50" onClick={()=>navigate("/world/swamp?legacyView=1&showRetired=1")}>Show all</button>
   <button data-testid="return" className="absolute bottom-0 z-50" onClick={()=>navigate("/world/swamp")}>New World</button>
 </div>:<WorldScenePlayerPage worldId="swamp"/>}
 <JansonQuestOverlay/><WorldNpcPlacementOverlay/></>;
}
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><Fixture/></QueryClientProvider>);
`;
const server = await createServer({
  server: {host:"127.0.0.1",port:4198,strictPort:true},
  plugins:[{name:"world-player-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:50"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });}}]
});
const image=(w,h,color)=>"data:image/svg+xml;base64,"+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`).toString("base64");
const art=image(200,200,"#a68356"), room=image(800,1000,"#31512e"), night=image(800,1000,"#142b17");
const npc={id:"catalog-janson",name:"Janson",imageUrl:art,type:"npc",worldId:"__npc_catalog__",specialSkill:null,legacyLocationId:"old-janson"};
const oldShop={id:"old-shop",worldId:"swamp",name:"Original Shop",type:"shop",isShop:true,bgUrl:room};
const oldJanson={id:"old-janson",worldId:"swamp",name:"Janson",type:"npc",isShop:false,iconUrl:art,bgUrl:null};
const base={worldId:"swamp",npcId:null,assetId:null,kind:"decor",effectType:null,effectColor:null,terrainKey:null,interiorDarkness:60,interiorNightDarkness:null,
  xPct:.5,yPct:.5,size:120,flipped:false,layer:0,decorEffects:[],isWaterSource:false,decorSurface:"barrier",isShop:false,legacyLocationId:null,shopItemIds:[],shopItemPlacements:[]};
const quest={questKey:"catch_fish",title:"Gone Fishing",status:"available",description:"Catch fish.",progress:0,targetCount:3,coinReward:500,rewardItemName:null,rewardItemQuantity:0};
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,timezoneId:"UTC"});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date("2026-11-26T23:00:00Z"));
    const errors=[],writes=[];page.on("pageerror",e=>errors.push(e.message));
    const scene={groundLevel:1,groundTheme:"swamp",
      assets:[{id:"building-art",kind:"building",name:"New Shop",worldId:"swamp",imageUrl:art,interiorImageUrl:room,nightInteriorImageUrl:night},
        {id:"decor-art",kind:"decor",name:"Room Decor",worldId:"swamp",imageUrl:art}],
      placements:[{...base,id:"shop",kind:"building",assetId:"building-art",xPct:.54,yPct:.55,isShop:true,legacyLocationId:"old-shop"},
        {...base,id:"janson",kind:"npc",npcId:npc.id,xPct:.38,yPct:.43},
        {...base,id:"effect",kind:"effect",effectType:"sparkles",xPct:.5,yPct:.15,size:300}],
      interiorItems:[{id:"room-decor",worldId:"swamp",buildingId:"shop",kind:"decor",assetId:"decor-art",effectType:null,xPct:.55,yPct:.6,size:130,flipped:false},
        {id:"room-lamp",worldId:"swamp",buildingId:"shop",kind:"effect",assetId:null,effectType:"lamp_light",xPct:.3,yPct:.3,size:70,flipped:false}],
      linkedPages:[oldShop,oldJanson],npcs:[npc]};
    let state={quests:[quest,{...quest,questKey:"sell_fish",title:"Sell Fish",status:"locked"}],dailyQuest:{...quest,questKey:"daily_catch_fish",status:"locked"},marketUnlocked:false};
    await page.route("**/api/**",route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      if(req.method()!=="GET")writes.push(path);
      if(path==="/api/worlds/swamp/player-scene")return route.fulfill({json:scene});
      if(path==="/api/auth/me")return route.fulfill({json:{id:"qa",username:"QA",isAdmin:false}});
      if(path==="/api/world/swamp/locations")return route.fulfill({json:[oldShop,oldJanson]});
      if(path==="/api/shop/__npc_catalog__")return route.fulfill({json:[npc]});
      if(path==="/api/quests/janson")return route.fulfill({json:state});
      if(path==="/api/quests/janson/catch_fish/start"){
        state={...state,quests:[{...quest,status:"accepted"},state.quests[1]]};
        return route.fulfill({json:state});
      }
      return route.fulfill({json:[]});
    });
    await page.goto("http://127.0.0.1:4198/world/swamp");
    const shop=page.getByTestId("player-new-world-object-shop");
    await shop.waitFor({state:"visible"});
    assert.equal(await page.getByTestId("location-old-shop").count(),1);
    assert.equal(await page.getByTestId("world-npc-art-old-janson").count(),0,"do not duplicate legacy NPC artwork");
    await page.getByTestId("player-world-zoom-in").tap();
    await shop.tap();
    const interior=page.getByTestId("player-new-world-interior");
    await interior.waitFor({state:"visible"});
    await page.getByTestId("player-new-world-interior-item-room-decor").waitFor({state:"visible"});
    await page.getByTestId("player-new-world-interior-item-room-lamp").waitFor({state:"visible"});
    await page.getByTestId("home-interior-darkness-layer").waitFor({state:"visible"});
    await page.getByTestId("player-new-world-interior-night").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("player-new-world-object-effect").count(),0,"outdoor sprites are not mounted over rooms");
    const child=await page.getByTestId("player-new-world-interior-item-room-decor").boundingBox(), bg=await interior.boundingBox();
    assert.ok(Math.abs(child.width/bg.width-130/850)<.02,"room decor uses the authored image scale");
    scene.interiorItems[0].xPct=.25;
    await page.evaluate(()=>window.refreshScene());
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-new-world-interior-item-room-decor"]')?.style.left &&
      Math.abs(parseFloat(document.querySelector('[data-testid="player-new-world-interior-item-room-decor"]').style.left)/document.querySelector('[data-testid="player-new-world-interior"]').clientWidth-.25)<.02);
    await page.getByTestId("player-new-world-enter-linked-page").tap();
    await page.getByTestId("legacy-view").waitFor({state:"visible"});
    await page.waitForFunction(()=>document.querySelector('[data-testid="opened-legacy"]')?.textContent==="old-shop");
    assert.equal(await page.getByTestId("location-old-shop").count(),0,"retired hotspot stays hidden even though direct entry works");
    await page.getByTestId("restore-visibility").tap();
    await page.getByTestId("location-old-shop").waitFor({state:"visible"});
    await page.getByTestId("return").tap();
    await page.getByTestId("button-talk-janson").waitFor({state:"visible"});
    await page.getByTestId("button-talk-janson").tap();
    await page.getByTestId("janson-quest-dialog").waitFor({state:"visible"});
    // Use the original quest start button, not a copied quest transaction.
    await page.getByTestId("button-start-janson-catch_fish").tap();
    await page.waitForURL(/fishHint=1/);
    assert.deepEqual(writes,["/api/quests/janson/catch_fish/start"]);
    assert.deepEqual(errors,[]);
    console.log("PASS "+name+": read-only world, live room edits, linked retired entry, recovery, original Janson quest handoff");
    await context.close();
  }
}finally{await browser.close();await server.close();}
