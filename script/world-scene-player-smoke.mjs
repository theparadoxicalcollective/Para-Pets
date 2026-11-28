import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";
import sharp from "sharp";

// Real player renderer, original location component and quest overlay.
// All requests are isolated fixtures; no production account or write routes.
const moduleId = "/__world-scene-player-fixture.tsx";
const fixture = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {createPortal} from "react-dom";
import {useNavHidden} from "@/lib/navVisibility";
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
// Render the same global HUD visibility subscription that FloatingNav uses.
function HudProbe(){
 const hidden=useNavHidden();
 return hidden?null:createPortal(<button data-testid="fixture-main-nav" style={{position:"absolute",right:12,bottom:16,pointerEvents:"auto"}}>Main navigation</button>,document.getElementById("game-viewport-hud"));
}
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
 <JansonQuestOverlay/><WorldNpcPlacementOverlay/><HudProbe/></>;
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
const visibleMedia="/api/media/12345678-1234-1234-1234-123456789abc";
const distantMedia="/api/media/12345678-1234-1234-1234-123456789abd";
const artBody=Buffer.from(art.split(",")[1],"base64");
const miniPet={shopItemId:"wisp-catalog",name:"Willow Wisp",imageUrl:art,animationStyle:"breath",
  parts:[{id:"body",partType:"body",imageUrl:art},{id:"open",partType:"eyes",imageUrl:art},{id:"closed",partType:"closed_eyes",imageUrl:art}]};
const npc={id:"catalog-janson",name:"Janson",imageUrl:art,type:"npc",worldId:"__npc_catalog__",specialSkill:null,legacyLocationId:"old-janson"};
const oldShop={id:"old-shop",worldId:"swamp",name:"Original Shop",type:"shop",isShop:true,bgUrl:room};
const oldJanson={id:"old-janson",worldId:"swamp",name:"Janson",type:"npc",isShop:false,iconUrl:art,bgUrl:null};
const base={worldId:"swamp",npcId:null,assetId:null,kind:"decor",effectType:null,effectColor:null,terrainKey:null,interiorDarkness:60,interiorNightDarkness:null,
  xPct:.5,yPct:.5,size:120,flipped:false,layer:0,decorEffects:[],isWaterSource:false,decorSurface:"barrier",isShop:false,legacyLocationId:null,shopItemIds:[],shopItemPlacements:[]};
const quest={questKey:"catch_fish",title:"Gone Fishing",status:"available",description:"Catch fish.",progress:0,targetCount:3,coinReward:500,rewardItemName:null,rewardItemQuantity:0};
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,timezoneId:"UTC"});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date("2026-11-26T23:00:00Z"));
    const errors=[],writes=[],mediaReads=[];page.on("pageerror",e=>errors.push(e.message));
    const scene={groundLevel:1,groundTheme:"swamp",
      assets:[{id:"building-art",kind:"building",name:"New Shop",worldId:"swamp",imageUrl:visibleMedia,interiorImageUrl:room,nightInteriorImageUrl:night},
        {id:"decor-art",kind:"decor",name:"Room Decor",worldId:"swamp",imageUrl:art},
        {id:"distant-art",kind:"building",name:"Distant Building",worldId:"swamp",imageUrl:distantMedia}],
      placements:[{...base,id:"shop",kind:"building",assetId:"building-art",xPct:.54,yPct:.55,isShop:true,legacyLocationId:"old-shop"},
        {...base,id:"distant-building",kind:"building",assetId:"distant-art",xPct:.01,yPct:.01,legacyLocationId:"old-distant"},
        {...base,id:"janson",kind:"npc",npcId:npc.id,xPct:.38,yPct:.43,idleAnimation:"float"},
        {...base,id:"mini-wisp",kind:"mini_pet",miniPetId:miniPet.shopItemId,xPct:.5,yPct:.46,size:88,idleAnimation:"breath"},
        {...base,id:"distant-mini",kind:"mini_pet",miniPetId:miniPet.shopItemId,xPct:.01,yPct:.01,size:88},
        {...base,id:"garden",kind:"terrain",effectType:"garden_plot",xPct:.46,yPct:.60,size:150},
        {...base,id:"spring",kind:"terrain",effectType:"water_path",xPct:.35,yPct:.57,size:150},
        {...base,id:"effect",kind:"effect",effectType:"sparkles",xPct:.5,yPct:.15,size:300}],
      interiorItems:[{id:"room-decor",worldId:"swamp",buildingId:"shop",kind:"decor",assetId:"decor-art",effectType:null,xPct:.55,yPct:.6,size:130,flipped:false},
        {id:"room-lamp",worldId:"swamp",buildingId:"shop",kind:"effect",assetId:null,effectType:"lamp_light",effectColor:"#7b5cff",xPct:.3,yPct:.3,size:70,flipped:false},
        {id:"room-fire",worldId:"swamp",buildingId:"shop",kind:"effect",assetId:null,effectType:"fire",xPct:.64,yPct:.42,size:60,flipped:false}],
      linkedPages:[oldShop,oldJanson,{id:"old-distant",worldId:"swamp",name:"Distant Building",type:"building",bgUrl:null}],npcs:[npc],miniPets:[miniPet]};
    let state={quests:[quest,{...quest,questKey:"sell_fish",title:"Sell Fish",status:"locked"}],dailyQuest:{...quest,questKey:"daily_catch_fish",status:"locked"},marketUnlocked:false};
    let plot={plotItemId:"garden",xPct:.46,yPct:.60,size:150,phase:"empty",cropId:null,waterApplied:0,harvestReady:false,pickedUntil:null};
    const gardenInventory=[{inventoryId:"hoe",shopItemId:"hoe-item",name:"Hoe",type:"garden_tool",specialType:"hoe",quantity:1},
      {inventoryId:"pail",shopItemId:"pail-item",name:"Watering Pail",type:"garden_tool",specialType:"watering_pail",quantity:1,isRefillable:true,gardenWaterLeft:50}];
    await page.route("**/api/**",route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      if(req.method()!=="GET")writes.push(path);
      if(path.startsWith(visibleMedia)||path.startsWith(distantMedia)){
        mediaReads.push(path);
        return route.fulfill({body:artBody,contentType:"image/svg+xml"});
      }
      if(path==="/api/worlds/swamp/garden")return route.fulfill({json:{serverNow:new Date().toISOString(),plots:[plot],crops:[]}});
      if(path==="/api/inventory")return route.fulfill({json:gardenInventory});
      if(path==="/api/worlds/swamp/garden/plots/garden/hoe"){
        assert.equal(req.postDataJSON().inventoryId,"hoe");
        plot={...plot,phase:"tilled"};
        return route.fulfill({json:{plot,replayed:false}});
      }
      if(path==="/api/worlds/swamp/water-sources/spring/refill"){
        assert.equal(req.postDataJSON().inventoryId,"pail");
        gardenInventory[1].gardenWaterLeft=100;
        return route.fulfill({json:{itemName:"Watering Pail",waterLeft:100,capacity:100}});
      }
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
    const mainNav=page.getByTestId("fixture-main-nav");
    await shop.waitFor({state:"visible"});
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-new-world-object-shop"] img')?.naturalWidth > 0);
    assert.ok(mediaReads.some(path=>path.startsWith(visibleMedia+"/world-v1/")),"visible art requests a size-matched copy");
    assert.equal(await page.getByTestId("location-old-distant").count(),1,"distant quest/location mount stays stable");
    assert.equal(await page.getByTestId("player-new-world-object-distant-building").locator("img").count(),0);
    assert.ok(!mediaReads.some(path=>path.startsWith(distantMedia)),"distant linked art is not requested");
    scene.placements.find(item=>item.id==="distant-building").xPct=.62;
    scene.placements.find(item=>item.id==="distant-building").yPct=.45;
    await page.evaluate(()=>window.refreshScene());
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-new-world-object-distant-building"] img')?.naturalWidth > 0);
    assert.ok(mediaReads.some(path=>path.startsWith(distantMedia+"/world-v1/")),"newly visible art loads after a live edit");
    assert.equal(await page.getByTestId("location-old-shop").count(),1);
    assert.equal(await page.getByTestId("world-npc-art-old-janson").count(),0,"do not duplicate legacy NPC artwork");
    const janson=page.getByTestId("player-new-world-object-janson");
    await janson.locator(".scene-npc-float").waitFor({state:"visible"});
    const mini=page.getByTestId("player-new-world-object-mini-wisp");
    await mini.locator(".scene-mini-pet-bounce").waitFor({state:"visible"});
    assert.ok(await mini.isDisabled(),"scenery Mini Pets are not player actions");
    assert.equal(await page.getByTestId("player-new-world-object-distant-mini").count(),0,"offscreen layered Mini Pets stay unmounted");
    assert.equal(await mini.locator(".mini-pet-eyes-closed").evaluate(el=>getComputedStyle(el).animationName),"miniPetBlinkClosed");
    const anchorBefore=await mini.boundingBox();
    // Advance the visual animation directly rather than waiting for its long cycle.
    await mini.locator(".scene-mini-pet-bounce").evaluate(el=>{for(const animation of el.getAnimations()) animation.currentTime=4000;});
    const anchorAfter=await mini.boundingBox();
    assert.deepEqual(anchorBefore,anchorAfter,"visual movement never changes placement hit/quest bounds");
    await page.emulateMedia({reducedMotion:"reduce"});
    assert.equal(await mini.locator(".scene-mini-pet-bounce").evaluate(el=>getComputedStyle(el).animationName),"none");
    await page.emulateMedia({reducedMotion:"no-preference"});
    assert.equal(await page.getByTestId("player-world-zoom-in").count(),0,"zoom buttons are hidden");
    assert.equal(await page.getByTestId("player-world-zoom-out").count(),0);
    // A real multi-step finger swipe beginning on an interactive building
    // must continue after touch capture transfers to the camera.
    const swipe=await context.newCDPSession(page);
    const start=await shop.boundingBox();
    const x=Math.round(start.x+start.width/2), y=Math.round(start.y+start.height/2);
    await swipe.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});
    for(const dx of [-12,-36,-60,-84,-108]){
      await swipe.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+dx,y,id:1}]});
    }
    await swipe.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.waitForFunction(before=>document.querySelector('[data-testid="player-new-world-object-shop"]').getBoundingClientRect().x<before-95,start.x);
    assert.equal(await page.getByTestId("player-new-world-building").count(),0,"swipe is not a building tap");
    await swipe.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:x-108,y,id:1}]});
    for(const dx of [12,36,60,84,108]){
      await swipe.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-108+dx,y,id:1}]});
    }
    await swipe.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.waitForFunction(before=>Math.abs(document.querySelector('[data-testid="player-new-world-object-shop"]').getBoundingClientRect().x-before)<6,start.x);
    await swipe.detach();
    const gardenPlot=page.getByRole("button",{name:"Open Garden Plot"});
    await gardenPlot.tap();
    await page.getByTestId("pet-park-garden-menu").waitFor({state:"visible"});
    const hoe=page.getByTestId("pet-park-garden-action-hoe");
    await Promise.all([page.waitForResponse(response=>response.url().includes("/garden/plots/garden/hoe")&&response.ok()),hoe.tap()]);
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-garden-action-hoe"]')?.disabled===true);
    assert.ok(writes.includes("/api/worlds/swamp/garden/plots/garden/hoe"));
    // Water is a canvas tile without a sprite button. Tap the saved diamond.
    const artBounds=await page.getByTestId("player-new-world-art").boundingBox();
    await page.touchscreen.tap(artBounds.x+artBounds.width*.35,artBounds.y+artBounds.height*.57);
    await page.getByTestId("pet-park-refill-popup").waitFor({state:"visible"});
    // One eligible pail refills automatically, exactly as in Pet Park.
    await page.getByTestId("pet-park-refill-complete").waitFor({state:"visible"});
    await page.getByTestId("pet-park-refill-popup").waitFor({state:"hidden"});
    const beforePinch=(await shop.boundingBox()).width;
    const cdp=await context.newCDPSession(page);
    const touchPoints=spread=>[{x:Math.round(width/2-spread),y:Math.round(height/2),id:1},{x:Math.round(width/2+spread),y:Math.round(height/2),id:2}];
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:touchPoints(50)});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:touchPoints(60)});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await cdp.detach();
    await page.waitForFunction(before=>document.querySelector('[data-testid="player-new-world-object-shop"]').getBoundingClientRect().width>before*1.05,beforePinch);
    scene.placements.find(item=>item.id==="shop").rotation=15;
    await page.evaluate(()=>window.refreshScene());
    await page.waitForFunction(()=>document.querySelector('[data-testid="location-old-shop"]')?.style.transform.includes("rotate(15deg)"));
    await shop.tap();
    const interior=page.getByTestId("player-new-world-interior");
    await interior.waitFor({state:"visible"});
    await page.getByTestId("player-new-world-interior-item-room-decor").waitFor({state:"visible"});
    const roomLamp = page.getByTestId("player-new-world-interior-item-room-lamp");
    await roomLamp.waitFor({state:"visible"});
    assert.match(await roomLamp.getByTestId("home-lamp-light-core").evaluate(node => node.style.backgroundImage), /123,\s*92,\s*255/,
      "players see the saved interior lamp color");
    await page.getByTestId("home-interior-darkness-layer").waitFor({state:"visible"});
    await page.getByTestId("player-new-world-interior-night").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("player-new-world-object-effect").count(),0,"outdoor sprites are not mounted over rooms");
    await mainNav.waitFor({state:"detached"});
    assert.equal(await page.getByTestId("player-new-world-building").getAttribute("aria-modal"),"true");
    const child=await page.getByTestId("player-new-world-interior-item-room-decor").boundingBox(), bg=await interior.boundingBox();
    assert.ok(Math.abs(child.width/bg.width-130/850)<.02,"room decor uses the authored image scale");
    assert.ok(bg.width >= width-1 && bg.height >= height-1, "room covers viewport, not letterboxed");
    assert.ok(Math.abs(bg.width/bg.height-.8)<.01, "room artwork retains its aspect ratio");
    // A screenshot of the actual rendered room, not just its SVG structure:
    // a light pool must brighten the artwork beyond the effect sprite, and a
    // distant decoration must be darkened by the very same mask.
    await page.getByTestId("player-new-world-interior-item-room-fire").waitFor();
    const mask = page.getByTestId("home-interior-darkness-layer");
    assert.equal(await mask.locator("mask circle").count(), 2);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="player-new-world-interior"] img')]
      .every(img => img.complete && img.naturalWidth > 0));
    const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({resolveWithObject:true});
    function pixel(x, y) {
      const px = Math.round(bg.x + x * bg.width), py = Math.round(bg.y + y * bg.height);
      assert.ok(px >= 0 && px < info.width && py >= 0 && py < info.height, "sample inside viewport");
      const i = (py * info.width + px) * info.channels;
      return [...data.subarray(i, i + 3)];
    }
    const unlit = pixel(.5, .78);
    const lampPool = pixel(.3, .37);
    const firePool = pixel(.64, .49);
    const dimmedDecor = pixel(.55, .65);
    assert.ok(lampPool[1] > unlit[1] + 7, `${name}: lamp lights nearby floor: ${lampPool} vs ${unlit}`);
    assert.ok(firePool[1] > unlit[1] + 7, `${name}: campfire lights nearby floor: ${firePool} vs ${unlit}`);
    assert.ok(dimmedDecor[0] < 110, `${name}: ordinary placed decor is dimmed too: ${dimmedDecor}`);
    const closeRoom=page.getByRole("button",{name:"Close building"});
    const closeBounds=await closeRoom.boundingBox();
    assert.ok(closeBounds.y>=8 && closeBounds.y+closeBounds.height<=height && closeBounds.width>=44 && closeBounds.height>=44,
      "close button is reachable with a touch-sized target");
    // Swipe the fixed room viewport, not a draggable image; this includes
    // immediate pointer capture, motion in both directions and reversing at
    // a clamped edge without having to retrace discarded swipe distance.
    const roomViewport=page.getByTestId("player-new-world-room-viewport");
    assert.equal(await roomViewport.evaluate(el=>getComputedStyle(el).touchAction),"none");
    await page.evaluate(()=>{
      window.roomCaptured=false;
      window.addEventListener("pointerdown",event=>{
        const room=document.querySelector('[data-testid="player-new-world-room-viewport"]');
        if(room?.contains(event.target)) window.roomCaptured=room.hasPointerCapture(event.pointerId);
      },{once:true});
    });
    const roomTouch=await context.newCDPSession(page);
    const startX=width/2, startY=height*.34;
    const roomSwipe=async(offsets,checkCapture=false)=>{
      await roomTouch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:startX,y:startY,id:1}]});
      if(checkCapture) assert.equal(await page.evaluate(()=>window.roomCaptured),true,"room owns the pointer immediately");
      for(const dx of offsets) await roomTouch.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:startX+dx,y:startY,id:1}]});
      await roomTouch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    };
    await roomSwipe([12,24,36,48,60],true);
    await page.waitForFunction(before=>document.querySelector('[data-testid="player-new-world-interior"]').getBoundingClientRect().x>before+10,bg.x);
    const movedBg=await interior.boundingBox(),movedChild=await page.getByTestId("player-new-world-interior-item-room-decor").boundingBox();
    assert.ok(Math.abs((movedChild.x-child.x)-(movedBg.x-bg.x))<2,"room pan moves saved decoration with its artwork");
    await roomSwipe([-12,-24,-36,-48,-60,-72]);
    await page.waitForFunction(before=>document.querySelector('[data-testid="player-new-world-interior"]').getBoundingClientRect().x<before-10,movedBg.x);
    // Reach the right edge in one or more swipes, then reverse while the
    // finger is still down. The camera should move immediately in reverse.
    for(let i=0;i<3;i++) await roomSwipe([20,40,60,80,100,120]);
    const edge=await interior.boundingBox();
    assert.ok(Math.abs(edge.x)<2,"room reaches left edge without blank space");
    await roomSwipe([12,24,36,48,60,48,36,24]);
    const reversed=await interior.boundingBox();
    assert.ok(reversed.x<edge.x-10,"reversing at the edge pans immediately");
    const lastChild=await page.getByTestId("player-new-world-interior-item-room-decor").boundingBox();
    assert.ok(Math.abs((lastChild.x-child.x)-(reversed.x-bg.x))<2);
    await roomTouch.detach();
    await closeRoom.tap();
    await page.getByTestId("player-new-world-building").waitFor({state:"hidden"});
    await mainNav.waitFor({state:"visible"});
    await shop.tap();
    await interior.waitFor({state:"visible"});
    scene.interiorItems[0].xPct=.25;
    scene.interiorItems[0].rotation=35;
    scene.interiorItems[0].flipped=true;
    scene.interiorItems[1].effectColor="#44dd88";
    await page.evaluate(()=>window.refreshScene());
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-new-world-interior-item-room-decor"]')?.style.left &&
      Math.abs(parseFloat(document.querySelector('[data-testid="player-new-world-interior-item-room-decor"]').style.left)/document.querySelector('[data-testid="player-new-world-interior"]').clientWidth-.25)<.02);
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-new-world-interior-item-room-decor"]')?.style.transform.includes("rotate(35deg) scaleX(-1)"));
    assert.equal(await page.getByRole("button",{name:"Rotate selected artwork right 5 degrees"}).count(),0,
      "rotation remains an admin-only edit control");
    await page.waitForFunction(() => /68,\s*221,\s*136/.test(document.querySelector(
      '[data-testid="player-new-world-interior-item-room-lamp"] [data-testid="home-lamp-light-core"]')?.style.backgroundImage ?? ""),
      undefined, { timeout: 10000 });
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
    assert.deepEqual(writes,["/api/worlds/swamp/garden/plots/garden/hoe","/api/worlds/swamp/water-sources/spring/refill","/api/quests/janson/catch_fish/start"]);
    assert.deepEqual(errors,[]);
    console.log("PASS "+name+": full finger swipe, pinch, room touch capture, left/right pan and edge reversal, HUD hide/restore, Pet Park garden and refill, live room edits, linked retired entry, recovery, original Janson quest handoff");
    await context.close();
  }
}finally{await browser.close();await server.close();}
