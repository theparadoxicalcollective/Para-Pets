import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real WalkAroundScene with isolated 08B avatar data. No Railway access,
// combat/reward writes or modifications to saved player state.
const moduleId = "/__avatar11-walk-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
  'import WalkAroundScene from "@/components/WalkAroundScene";',
  'import "@/index.css";',
  'const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0,refetchOnWindowFocus:false}}});',
  'const config={',
  ' id:"a1b2c3d4-0011-4000-8000-000000000011",worldId:"swamp",',
  ' route:"/explore/elysian-bayou-clearing",name:"Elysian Bayou Clearing",',
  ' sceneType:"walk-around",backgroundUrl:"data:image/svg+xml;base64,"+btoa(\'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="620"><rect width="360" height="620" fill="#293b2a"/></svg>\'),',
  ' walkableBounds:{xMin:0.08,xMax:0.92,yMin:0.05,yMax:0.94},',
  ' spawnPoint:{x:0.5,y:0.7},movementSpeed:0.27,petSize:96,',
  ' worldSize:{width:1,height:1},',
  ' cameraMode:"device-viewport",',
  ' features:{movement:true,enemies:false,combat:false,rewards:false,interactions:true},',
  '};',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}>',
  ' <WalkAroundScene config={config} userId="avatar11-fixture" petTemplateId={null} activePet={null} onBack={()=>{}} />',
  '</QueryClientProvider>);',
].join("\n");

const server=await createServer({
  server:{host:"127.0.0.1",port:4201,strictPort:true},
  plugins:[{
    name:"avatar11-walk-fixture",
    resolveId:id=>id===moduleId?id:null,
    load:id=>id===moduleId?fixture:null,
    configureServer(server){
      server.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes("text/html"))return next();
        res.setHeader("Content-Type","text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
          '<div id="root" style="position:fixed;inset:0;overflow:hidden"></div>'+
          '<script type="module" src="'+moduleId+'"></script></body></html>'));
      });
    },
  }],
});
const art="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><ellipse cx="60" cy="60" rx="35" ry="49" fill="#dbc281"/></svg>'
).toString("base64");
const parts=["head","top","left_arm","right_arm","left_leg","right_leg","left_foot","right_foot"].map((partType,i)=>({
  partType,imageUrl:art,xPct:50+(i%3-1)*7,yPct:20+i*8,widthPct:22,
  pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:10+i,
}));
const clothing={category:"bottom",inventoryId:"pants-owned",shopItemId:"pants-shop",
  name:"Forest Pants",imageUrl:art,segments:["left_leg","right_leg"].map(partType=>({
    partType,imageUrl:art,
    fit:{xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:5},
    renderPlane:"with_part",
  }))};
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  const scenarios=[
    {name:"compact phone",width:320,height:700,created:true},
    {name:"phone",width:390,height:844,created:true},
    {name:"tablet",width:834,height:1194,created:true},
    {name:"not created",width:390,height:844,created:false},
    {name:"failed read",width:390,height:844,created:false,error:true},
  ];
  for(const sc of scenarios){
    const context=await browser.newContext({
      viewport:{width:sc.width,height:sc.height},isMobile:true,hasTouch:true,
    });
    const page=await context.newPage();
    page.setDefaultTimeout(18000);
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/api/**",route=>{
      const url=new URL(route.request().url());
      if(url.pathname==="/api/player-avatar"){
        if(sc.error)return route.fulfill({status:503,json:{message:"Temporarily unavailable"}});
        return route.fulfill({json:{
          created:sc.created,revision:sc.created?1:null,
          base:{id:"base",name:"Forest Explorer",publishedAt:"2026-11-09T00:00:00Z",parts},
          ownedClothing:[],equipped:sc.created?[clothing]:[],
          unavailableEquipmentSlots:[],
        }});
      }
      return route.fulfill({json:[]});
    });
    await page.goto("http://127.0.0.1:4201/avatar11-fixture",{waitUntil:"domcontentloaded"});
    await page.getByTestId("walkaround-world-layer").waitFor({state:"visible"});
    if(sc.created){
      const actor=page.getByTestId("walk-avatar-actor");
      await actor.waitFor({state:"visible"});
      assert.equal(await page.getByTestId("walk-pet-sprite").count(),0,sc.name+": no duplicate pet");
      assert.equal(await actor.locator('[data-clothing-part="left_leg"]').count(),1);
      assert.equal(await actor.locator('[data-clothing-part="right_leg"]').count(),1);
      const worldActor=page.getByTestId("walk-world-actor");
      const initial=await worldActor.evaluate(el=>({
        x:parseFloat(el.style.left),y:parseFloat(el.style.top),z:Number(el.style.zIndex),
      }));
      assert.ok(initial.x>=8&&initial.x<=92&&initial.y>=5&&initial.y<=94,
        sc.name+": spawn lies inside authored walk bounds");

      await page.keyboard.down("ArrowRight");
      await page.waitForFunction(()=>
        document.querySelector('[data-testid="walk-avatar-actor"] [data-character-motion]')?.getAttribute("data-character-motion")==="walk");
      await page.waitForTimeout(180);
      await page.keyboard.up("ArrowRight");
      await page.waitForFunction(()=>
        document.querySelector('[data-testid="walk-avatar-actor"] [data-character-motion]')?.getAttribute("data-character-motion")==="idle");
      const after=await worldActor.evaluate(el=>({
        x:parseFloat(el.style.left),y:parseFloat(el.style.top),z:Number(el.style.zIndex),
      }));
      assert.ok(after.x>initial.x+0.2,sc.name+": joystick/controller movement advances the avatar");
      assert.ok(after.x<=92&&after.y<=94,sc.name+": actor stays within walkable bounds");
      assert.ok(after.z>=initial.z,sc.name+": entity depth remains world-Y based");

      const startX=Math.round(sc.width*0.45),startY=Math.round(sc.height*0.6);
      await page.mouse.move(startX,startY);
      await page.mouse.down();
      await page.mouse.move(startX+45,startY+6,{steps:3});
      await page.getByTestId("floating-joystick").waitFor({state:"visible"});
      await page.waitForTimeout(120);
      await page.mouse.up();
      await page.getByTestId("floating-joystick").waitFor({state:"detached"});
    }else{
      await page.waitForResponse(r=>r.url().endsWith("/api/player-avatar"),{timeout:18000}).catch(()=>{});
      assert.equal(await page.getByTestId("walk-avatar-actor").count(),0,
        sc.name+": absent/failed saved avatar cannot be synthesized");
    }
    assert.deepEqual(errors,[],sc.name+": no browser runtime errors");
    console.log("PASS "+sc.name+": world actor identity, walk/idle, bounds, clothing and input lifecycle");
    await context.close();
  }
}finally{
  await browser.close();
  await server.close();
}
