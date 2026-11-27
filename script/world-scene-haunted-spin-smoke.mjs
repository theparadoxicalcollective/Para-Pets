import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real new-world player scene, original NPC bridge, and original prize wheel.
// Only network responses are fixtures; no production account or spin occurs.
const moduleId = "/__world-scene-haunted-spin-fixture.tsx";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {useLocation,useSearch} from "wouter";
import WorldScenePlayerPage from "@/pages/WorldScenePlayerPage";
import BeauPrizeWheelBridge from "@/components/BeauPrizeWheelBridge";
import "@/index.css";
const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
function Fixture(){
 const [,navigate]=useLocation(), search=useSearch();
 return <>{new URLSearchParams(search).has("legacyView")?
   <div className="absolute inset-0" data-testid="old-world">
     <div data-testid="location-old-beau" style={{position:"absolute",left:"25%",top:"35%",width:130,height:130,background:"#543751"}}>Beau</div>
     <button className="absolute bottom-4" onClick={()=>navigate("/world/haunted_woods")}>Return to new world</button>
   </div>:<WorldScenePlayerPage worldId="haunted_woods"/>}
  <BeauPrizeWheelBridge/></>;
}
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><Fixture/></QueryClientProvider>);
`;
const server = await createServer({
  server: {host:"127.0.0.1",port:4199,strictPort:true},
  plugins:[{name:"world-scene-haunted-spin-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:50"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });}}]
});
const image = (w,h,color) => "data:image/svg+xml;base64,"+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="10" y="10" width="${w-20}" height="${h-20}" fill="${color}"/></svg>`).toString("base64");
const art=image(200,200,"#aa69d6"), room=image(800,1000,"#31512e");
const base={worldId:"haunted_woods",npcId:null,assetId:null,kind:"decor",effectType:null,effectColor:null,terrainKey:null,
  interiorDarkness:60,interiorNightDarkness:null,xPct:.5,yPct:.5,size:120,flipped:false,layer:0,decorEffects:[],
  isWaterSource:false,decorSurface:"barrier",isShop:false,legacyLocationId:null,shopItemIds:[],shopItemPlacements:[]};
const asset=(id,kind,name)=>({id,worldId:"haunted_woods",kind,name,imageUrl:art,interiorImageUrl:kind==="building"?room:null,nightInteriorImageUrl:null,tapImageUrl:null});
const scene={groundLevel:1,groundTheme:"haunted",assets:[asset("spin-art","decor","Haunted Spin"),asset("ordinary-art","decor","Haunted Spin Sign"),asset("casino-art","building","Haunted Casino")],
 placements:[{...base,id:"spin",assetId:"spin-art",xPct:.43,yPct:.43,size:240},{...base,id:"ordinary",assetId:"ordinary-art",xPct:.57,yPct:.43,size:100},
 {...base,id:"casino",kind:"building",assetId:"casino-art",xPct:.55,yPct:.58,size:220}],interiorItems:[],linkedPages:[],npcs:[]};
const slots=Array.from({length:8},(_,slot)=>({slot,configured:true,rarity:"common",chance:.125,kind:slot===7?"loss":"coins",label:slot===7?"Skull":"100 Coins",imageUrl:null,amount:slot===7?null:100,shopItemId:null}));
const initialState = ()=>({ready:true,layout:{left:25.55,top:32.47,size:69.5},pointerLayout:{x:96,y:60.3,size:4.6},
 slots,requiresActivePet:false,activePetReady:true,activePetName:"Fixture Pet",balances:{coins:5000,essence:10},freeSpinAvailable:true,nextSpinCost:0,isAdmin:false});
await server.listen();
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
try {
 for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,timezoneId:"UTC"});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
  const errors=[],writes=[];page.on("pageerror",e=>errors.push(e.message));
  let state=initialState(), legacyExists=false, failNext=false;
  await page.route("**/api/**",route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()!=="GET") writes.push({path,body:req.postDataJSON()});
    if(path==="/api/worlds/haunted_woods/player-scene")return route.fulfill({json:scene});
    if(path==="/api/auth/me")return route.fulfill({json:{id:"qa",username:"QA",isAdmin:state.isAdmin}});
    if(path==="/api/world/haunted_woods/locations")return route.fulfill({json:legacyExists?[{id:"old-beau",worldId:"haunted_woods",name:"Beau",type:"npc"}]:[]});
    if(path==="/api/beau-prize-wheel"){
      if(failNext){failNext=false;return route.fulfill({status:503,json:{message:"Please try again"}});}
      return route.fulfill({json:state});
    }
    if(path==="/api/beau-prize-wheel/spin"){
      assert.equal(state.freeSpinAvailable,true,"one daily free spin only");
      state={...state,balances:{...state.balances,coins:state.balances.coins+100},freeSpinAvailable:false,nextSpinCost:2500};
      return route.fulfill({json:{slotIndex:0,wasFree:true,cost:0,reward:{...slots[0],message:"You won 100 coins!"},balances:state.balances,freeSpinAvailable:false,nextSpinCost:2500}});
    }
    return route.fulfill({json:{}});
  });
  await page.goto("http://127.0.0.1:4199/world/haunted_woods",{waitUntil:"commit"});
  const spin=page.getByRole("button",{name:"Haunted Spin",exact:true});
  const marker=page.getByTestId("haunted-spin-free-indicator");
  const overlay=page.getByTestId("beau-prize-wheel-overlay");
  const spinButton=page.getByTestId("button-spin-beau-prize-wheel");
  await spin.waitFor({state:"visible",timeout:30000});
  await marker.waitFor({state:"visible",timeout:30000});
  assert.equal(await page.getByTestId("player-new-world-object-ordinary").isDisabled(),true);
  assert.equal(await page.getByTestId("location-old-beau").count(),0);
  // Start a real touch drag on the decoration. It must pan, not launch a spin.
  const before=await spin.boundingBox(), session=await context.newCDPSession(page);
  const p={x:before.x+before.width/2,y:before.y+before.height/2};
  await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...p,id:1}]});
  for(let i=1;i<=5;i++)await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:p.x+i*5,y:p.y+i*3,id:1}]});
  await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  assert.equal(await overlay.count(),0);
  const after=await spin.boundingBox();
  assert.ok(Math.abs(after.x-before.x)>5||Math.abs(after.y-before.y)>5,name+": drag pans the scene");
  // Chromium suppresses compatibility clicks immediately after a scroll gesture.
  await page.waitForTimeout(500);
  // Existing building still behaves independently.
  await page.getByRole("button",{name:"Haunted Casino",exact:true}).tap();
  await page.getByTestId("player-new-world-building").waitFor();
  await page.getByRole("button",{name:"Close building",exact:true}).tap();
  // Fresh server errors and incomplete setup must not launch the game.
  failNext=true;await spin.tap();await page.getByText("Please try again",{exact:true}).waitFor();
  assert.equal(await overlay.count(),0);
  state={...state,ready:false};await spin.tap();
  await page.getByText("Beau's prize wheel isn't ready yet. Check back after all prizes have been set.",{exact:true}).waitFor();
  assert.equal(await overlay.count(),0);
  assert.deepEqual(writes,[],"opening attempts never spin");
  state={...state,ready:true};await spin.tap();
  await overlay.waitFor({state:"visible"});
  assert.equal(await spinButton.textContent(),"FREE SPIN");
  assert.deepEqual(writes,[],"opening the wheel does not consume the daily spin");
  await spinButton.tap();
  await page.getByText("You won 100 coins!",{exact:true}).waitFor();
  assert.equal(writes.length,1);
  assert.equal(writes[0].path,"/api/beau-prize-wheel/spin");
  assert.match(writes[0].body.actionId,/^[\da-f-]{36}$/i);
  await page.getByRole("button",{name:"Close Beau's Prize Wheel",exact:true}).tap();
  await overlay.waitFor({state:"hidden"});
  await marker.waitFor({state:"hidden"});
  const samePan=await spin.boundingBox();
  assert.ok(Math.abs(samePan.x-after.x)<1 && Math.abs(samePan.y-after.y)<1,"closing returns to the same scene/camera");
  await spin.tap();await overlay.waitFor();
  assert.match(await spinButton.textContent(),/2,500/);
  await page.getByRole("button",{name:"Close Beau's Prize Wheel",exact:true}).tap();
  // Restore the original-world NPC. It uses exactly the same backend state.
  legacyExists=true;
  await page.goto("http://127.0.0.1:4199/world/haunted_woods?legacyView=1",{waitUntil:"commit"});
  await page.getByRole("button",{name:"Open Beau's Prize Wheel"}).tap();
  await overlay.waitFor();
  assert.match(await spinButton.textContent(),/2,500/);
  await page.getByRole("button",{name:"Close Beau's Prize Wheel",exact:true}).tap();
  assert.equal(writes.length,1,"no second daily spin or other write");
  assert.deepEqual(errors,[]);
  await context.close();
  console.log("PASS "+name+": Haunted Spin, pan-safe taps, ordinary decor and building, fresh state/errors, original daily spin, return camera and legacy rollback");
 }
} finally {await browser.close();await server.close();}
