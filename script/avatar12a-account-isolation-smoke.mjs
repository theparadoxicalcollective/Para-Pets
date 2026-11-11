import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real wardrobe UI and React Query under two simulated signed-in identities.
// Only disposable browser fixtures; no Railway, real user or shop writes.
const moduleId="/__avatar12a-account-isolation.tsx";
const fixture=[
  'import React, { useEffect, useState } from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { QueryClient, QueryClientProvider } from "@tanstack/react-query";',
  'import PlayerAvatarPage from "@/pages/PlayerAvatarPage";',
  'import "@/index.css";',
  'const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0,refetchOnWindowFocus:false}}});',
  'window.__avatar12aCache=qc;',
  'function Fixture(){',
  ' const [userId,setUserId]=useState("account-A");',
  ' useEffect(()=>{window.__switchAvatarAccount=setUserId;},[]);',
  ' return <PlayerAvatarPage userId={userId}/>;',
  '}',
  'createRoot(document.getElementById("root")).render(',
  ' <QueryClientProvider client={qc}><Fixture/></QueryClientProvider>);',
].join("\n");
const server=await createServer({
  server:{host:"127.0.0.1",port:4202,strictPort:true},
  plugins:[{
    name:"avatar12a-account-isolation",
    resolveId:id=>id===moduleId?id:null,
    load:id=>id===moduleId?fixture:null,
    configureServer(server){
      server.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes("text/html"))return next();
        res.setHeader("Content-Type","text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
          '<div id="game-stage" data-coordinate-owner="viewport" style="position:fixed;inset:0">'+
          '<div id="root" style="position:absolute;inset:0"></div></div>'+
          '<script type="module" src="'+moduleId+'"></script></body></html>'));
      });
    },
  }],
});
const art="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="130"><circle cx="65" cy="65" r="50" fill="#d6b576"/></svg>'
).toString("base64");
const parts=["head","top","left_arm","right_arm","left_leg","right_leg","left_foot","right_foot"]
  .map((partType,i)=>({partType,imageUrl:art,xPct:50,yPct:23+i*8,
    widthPct:25,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:i+10}));
const makeAccount=(id,revision)=>({
  created:true,revision,
  base:{id:"published-base",name:"Forest Person",publishedAt:"2026-11-09T00:00:00Z",parts},
  ownedClothing:[{category:"head",inventoryId:"hat-"+id,shopItemId:"sku-"+id,
    name:"Hat for "+id,imageUrl:art,quantity:1,isListed:false,compatible:true,
    segments:[{partType:"head",imageUrl:art,fit:{xPct:50,yPct:50,widthPct:100,
      pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:3},renderPlane:"with_part"}]}],
  equipped:[],unavailableEquipmentSlots:[],
});
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({
      viewport:{width,height},isMobile:true,hasTouch:true,
    });
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[],writes=[];
    const accounts={"account-A":makeAccount("account-A",2),"account-B":makeAccount("account-B",9)};
    let active="account-A";
    let releaseBRead, releaseASave, confirmASaveStarted;
    const bReadGate=new Promise(resolve=>{releaseBRead=resolve;});
    const aSaveGate=new Promise(resolve=>{releaseASave=resolve;});
    const aSaveStarted=new Promise(resolve=>{confirmASaveStarted=resolve;});
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/player-avatar**",async route=>{
      const path=new URL(route.request().url()).pathname;
      const method=route.request().method();
      if(path==="/api/player-avatar"&&method==="GET"){
        const requestAccount=active;
        // Hold the B response until the loading UI is observed. This avoids
        // timing-dependent UI tests on slower mobile browser emulation.
        if(requestAccount==="account-B")await bReadGate;
        return route.fulfill({json:accounts[requestAccount]});
      }
      if(path==="/api/player-avatar/equipment/head"&&method==="PUT"){
        const requestAccount=active;
        const body=route.request().postDataJSON();
        assert.equal(body.expectedRevision,accounts[requestAccount].revision,
          name+": revision stays tied to the authenticated account");
        assert.equal(body.inventoryId,"hat-"+requestAccount,
          name+": cannot equip another account's clothing");
        confirmASaveStarted();
        // Complete the old account's save only AFTER B has loaded.
        await aSaveGate;
        writes.push(requestAccount);
        const owned=accounts[requestAccount].ownedClothing[0];
        accounts[requestAccount]={...accounts[requestAccount],revision:accounts[requestAccount].revision+1,
          equipped:[{category:"head",inventoryId:owned.inventoryId,
            shopItemId:owned.shopItemId,name:owned.name,imageUrl:owned.imageUrl,
            segments:owned.segments}]};
        return route.fulfill({json:accounts[requestAccount]});
      }
      return route.fulfill({status:404,json:{message:"Unsupported QA fixture route"}});
    });
    await page.goto("http://127.0.0.1:4202/avatar12a-fixture",{waitUntil:"domcontentloaded"});
    // Wardrobes now start closed until a clothing category is tapped.
    await page.getByTestId("avatar-category-head").tap();
    await page.getByTestId("avatar-clothing-hat-account-A").waitFor({state:"visible"});
    await page.getByTestId("avatar-clothing-hat-account-A").tap();
    const save=page.waitForResponse(r=>r.request().method()==="PUT"&&r.url().includes("/equipment/head"));
    await page.getByTestId("avatar-equip-button").tap();
    await aSaveStarted;
    // Force a live account change while account A's server mutation is still
    // in flight. Completing A's response must NEVER populate B's cache.
    active="account-B";
    await page.evaluate(()=>window.__switchAvatarAccount("account-B"));
    await page.getByTestId("avatar-loading").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-clothing-hat-account-A").count(),0,
      name+": account A wardrobe must disappear while B is loading");
    releaseBRead();
    await page.getByTestId("avatar-clothing-hat-account-B").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-clothing-hat-account-A").count(),0,
      name+": account A inventory must not leak into B");
    assert.equal(await page.locator(".player-avatar-page__equipped-dot").count(),0,
      name+": A's equipped hat must not be displayed on B");

    releaseASave();
    await save;
    await page.waitForFunction(()=>
      window.__avatar12aCache.getQueryData(["/api/player-avatar","account-A"])?.revision===3);
    assert.deepEqual(writes,["account-A"]);
    assert.equal(await page.locator(".player-avatar-page__equipped-dot").count(),0,
      name+": late A save must not set B's equipped state");

    const keys=await page.evaluate(()=>{
      const q=window.__avatar12aCache;
      return {
        a:q.getQueryData(["/api/player-avatar","account-A"]),
        b:q.getQueryData(["/api/player-avatar","account-B"]),
        unscoped:q.getQueryData(["/api/player-avatar"]),
      };
    });
    assert.equal(keys.a.equipped[0].inventoryId,"hat-account-A");
    assert.deepEqual(keys.b.equipped,[]);
    assert.equal(keys.unscoped,undefined,name+": no shared account-data cache");

    active="account-A";
    await page.evaluate(()=>window.__switchAvatarAccount("account-A"));
    await page.getByTestId("avatar-clothing-hat-account-A").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-clothing-hat-account-B").count(),0);
    assert.deepEqual(errors,[],name+": no React runtime errors");
    console.log("PASS "+name+": wardrobe account switch, no stale outfit flash and isolated revisions");
    await context.close();
  }
}finally{
  await browser.close();
  await server.close();
}
