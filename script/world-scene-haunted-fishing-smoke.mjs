import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercise the real world, fishing page and shared leaderboard; mock only
// network data. Opening/closing these scenes must not write gameplay state.
const moduleId = "/__world-scene-haunted-fishing-fixture.tsx";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {getQueryFn} from "@/lib/queryClient";
import WorldScenePlayerPage from "@/pages/WorldScenePlayerPage";
import "@/index.css";
import "@/tabletStageShell.css";
const client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:getQueryFn({on401:"throw"}),refetchOnWindowFocus:false}}});
const world=location.pathname.split("/").pop();
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><WorldScenePlayerPage worldId={world}/></QueryClientProvider>);
`;
const server = await createServer({
  server: { host:"127.0.0.1", port:4203, strictPort:true },
  plugins:[{name:"world-scene-haunted-fishing-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="game-viewport-backdrop" style="position:absolute;inset:0;pointer-events:none"></div><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:50"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });}}]
});
const art = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#8759bd"/></svg>').toString("base64");
const world = "haunted_woods";
const wraithwater = "e2f3a4b5-0011-4000-8000-000000000011";
const moonveil = "e2f3a4b5-0012-4000-8000-000000000012";
const base = {worldId:world,npcId:null,assetId:null,kind:"decor",effectType:null,effectColor:null,terrainKey:null,
  interiorDarkness:60,interiorNightDarkness:null,xPct:.5,yPct:.5,size:100,flipped:false,layer:0,decorEffects:[],
  isWaterSource:false,decorSurface:"barrier",isShop:false,legacyLocationId:null,shopItemIds:[],shopItemPlacements:[]};
const asset=(id,name)=>({id,worldId:world,kind:"decor",name,imageUrl:art,interiorImageUrl:null,nightInteriorImageUrl:null,tapImageUrl:null});
const scene={groundLevel:1,groundTheme:"haunted",assets:[asset("board-art","Fish Leaderboard"),asset("ordinary-art","Fish Leaderboard Sign")],
  placements:[
    {...base,id:"board",assetId:"board-art",xPct:.43,yPct:.43,size:180},
    {...base,id:"ordinary",assetId:"ordinary-art",xPct:.57,yPct:.43},
    {...base,id:"ripple",kind:"effect",effectType:"water_ripple",xPct:.43,yPct:.55,size:130},
    {...base,id:"ripple2",kind:"effect",effectType:"water_ripple",xPct:.57,yPct:.55,size:130},
    {...base,id:"shimmer",kind:"effect",effectType:"water_shimmer",xPct:.5,yPct:.68}
  ],interiorItems:[],linkedPages:[],npcs:[]};
const leaderboard={top:[{userId:"angler",username:"Ghost Angler",profileImage:null,points:1250}],me:{rank:22,points:380}};
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
try {
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const page=await context.newPage(); page.setDefaultTimeout(20000);
    await page.addInitScript(()=>localStorage.setItem("fishingTutorialSeen","true"));
    const reads=[],writes=[],errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    let primaryStatus=200, fallbackStatus=200;
    const boardName=name==="phone"?"Fishing Leaderboard":"Haunted Forest Fishing Leaderboard";
    const fixtureScene={...scene,assets:scene.assets.map(a=>a.id==="board-art"?{...a,name:boardName}:a)};
    await page.route("**/api/**",route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      (req.method()==="GET"?reads:writes).push(path);
      if(path==="/api/worlds/haunted_woods/player-scene")return route.fulfill({json:fixtureScene});
      if(path==="/api/worlds/swamp/player-scene"||path==="/api/worlds/volcanic/player-scene"){
        const worldId=path.split("/")[3];
        return route.fulfill({json:{...fixtureScene,assets:fixtureScene.assets.map(a=>({...a,worldId})),placements:fixtureScene.placements.map(p=>({...p,worldId}))}});
      }
      if(path==="/api/auth/me")return route.fulfill({json:{id:"qa",username:"QA",coins:100,isAdmin:false}});
      if(path==="/api/fishing/leaderboard/haunted_woods")return route.fulfill({json:leaderboard});
      if(path===`/api/location/${wraithwater}`||path===`/api/location/${moonveil}`){
        const primary=path.endsWith(wraithwater);
        return route.fulfill({status:primary?primaryStatus:fallbackStatus,json:{
          id:primary?wraithwater:moonveil,worldId:world,type:"fishing",isShop:false,bgUrl:art,
          name:primary?"Wraithwater Fishing Spot":"Moonveil Fishing Spot"}});
      }
      if(path==="/api/fishing/equipment")return route.fulfill({json:{equipment:null,poleItem:null,baitItem:null,poleUsesLeft:null}});
      if(path==="/api/inventory"||path==="/api/fishing/inventory"||path.endsWith("/pond-fish"))return route.fulfill({json:[]});
      return route.fulfill({json:{}});
    });
    await page.goto("http://127.0.0.1:4203/world/haunted_woods",{waitUntil:"commit"});
    const object=id=>page.getByTestId(`player-new-world-object-${id}`);
    const board=object("board"), ripple=object("ripple"), modal=page.getByTestId("world-scene-fishing-dialog");
    const panel=page.getByTestId("fishing-leaderboard-panel"), fishing=page.getByTestId("fishing-page");
    await board.waitFor({state:"visible",timeout:30000});
    const rippleRim=()=>ripple.locator(".park-water-effect--water_ripple").evaluate(el=>getComputedStyle(el,":before").borderTopColor);
    assert.equal(await rippleRim(),"rgba(190, 197, 239, 0.8)");
    assert.equal(await object("ordinary").isDisabled(),true);
    assert.equal(await object("shimmer").isDisabled(),true);
    assert.equal(await board.isEnabled(),true,boardName+" must be tappable");
    await board.tap();
    await panel.getByText("HAUNTED HOOKS",{exact:true}).waitFor();
    await panel.getByText("Ghost Angler",{exact:true}).waitFor();
    assert.match(await panel.innerText(),/1,250/);
    assert.match(await panel.innerText(),/380/);
    assert.ok(reads.includes("/api/fishing/leaderboard/haunted_woods"));
    assert.ok(!reads.some(p=>p.startsWith("/api/location/")||p==="/api/fishing/equipment"));
    const before=await board.boundingBox();
    await page.getByTestId("button-fishing-leaderboard-close").tap();
    await modal.waitFor({state:"detached"});
    assert.deepEqual(await board.boundingBox(),before,"closing board preserves camera");

    // Drag starting on the linked ripple must pan instead of opening fishing.
    const initial=await ripple.boundingBox(), session=await context.newCDPSession(page);
    const p={x:initial.x+initial.width/2,y:initial.y+initial.height/2};
    await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...p,id:1}]});
    for(let i=1;i<=5;i++) await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:p.x+i*5,y:p.y+i*3,id:1}]});
    await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.equal(await modal.count(),0);
    const after=await ripple.boundingBox();
    assert.ok(Math.abs(after.x-initial.x)>5||Math.abs(after.y-initial.y)>5);
    await page.waitForTimeout(500);

    const pondResponse=page.waitForResponse(res=>res.url().endsWith(`/api/location/${wraithwater}/pond-fish`));
    await ripple.tap();
    await fishing.getByText("Wraithwater Fishing Spot",{exact:true}).waitFor();
    assert.ok((await pondResponse).ok());
    const bounds=await fishing.boundingBox();
    assert.ok(bounds.width>=width-2&&bounds.height>=height-2,"fishing fills device viewport");
    assert.equal(await fishing.locator('img').first().getAttribute("src"),art,"pond backdrop stays inside modal");
    await page.getByTestId("button-fishing-leaderboard").tap();
    await panel.getByText("Ghost Angler",{exact:true}).waitFor();
    assert.match(await panel.innerText(),/1,250/);
    await page.getByTestId("button-fishing-leaderboard-close").tap();
    await page.getByTestId("button-close-fishing").tap();
    await modal.waitFor({state:"detached"});
    assert.deepEqual(await ripple.boundingBox(),after,"closing fishing preserves camera");

    primaryStatus=404;
    await object("ripple2").tap();
    await fishing.getByText("Moonveil Fishing Spot",{exact:true}).waitFor();
    assert.ok(reads.includes(`/api/location/${moonveil}`));
    await page.getByTestId("button-close-fishing").tap();
    await modal.waitFor({state:"detached"});
    fallbackStatus=404;
    await ripple.tap();
    await modal.getByRole("alert").waitFor();
    assert.equal(await fishing.count(),0);
    primaryStatus=200;
    await modal.getByRole("button",{name:"Retry"}).tap();
    await fishing.getByText("Wraithwater Fishing Spot",{exact:true}).waitFor();
    await page.getByTestId("button-close-fishing").tap();
    await modal.waitFor({state:"detached"});
    assert.equal(new URL(page.url()).pathname,"/world/haunted_woods");

    await page.goto("http://127.0.0.1:4203/world/swamp",{waitUntil:"commit"});
    await object("board").waitFor();
    for(const id of ["board","ripple","ripple2","shimmer","ordinary"])assert.equal(await object(id).isDisabled(),true);
    assert.equal(await rippleRim(),"rgba(232, 252, 255, 0.7)");
    await page.goto("http://127.0.0.1:4203/world/volcanic",{waitUntil:"commit"});
    await ripple.waitFor();
    assert.equal(await rippleRim(),"rgba(255, 196, 95, 0.8)");
    assert.deepEqual(writes,[],"opening linked fishing UI never mutates progression");
    assert.deepEqual(errors,[],"no browser errors");
    await context.close();
    console.log(`PASS ${name}: exact board and ripple links, same gameplay UI, camera, fallback, retry, world isolation`);
  }
} finally {await browser.close();await server.close();}
