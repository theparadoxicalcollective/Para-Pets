import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// The actual published-world page and account avatar, using disposable scene
// data. Touches go through Chromium's native pointer/capture/click pipeline.
const moduleId = "/__world-scene-walk-fixture.tsx";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import WorldScenePlayerPage from "@/pages/WorldScenePlayerPage";
import {getQueryFn} from "@/lib/queryClient";
import "@/index.css";
const qc=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false}}});
createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}>
 <WorldScenePlayerPage worldId={new URLSearchParams(location.search).get("world")||"swamp"} userId="fixture-player"/>
</QueryClientProvider>);
`;
const server=await createServer({server:{host:"127.0.0.1",port:4293,strictPort:true},plugins:[{
  name:"world-scene-walk-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html")) return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="position:fixed;inset:0;overflow:hidden"></div><script type="module" src="'+moduleId+'"></script></body></html>'));
  });}
}]});
const image=(body,w=120,h=120)=>"data:image/svg+xml;base64,"+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`).toString("base64");
const art=image('<ellipse cx="60" cy="60" rx="36" ry="49" fill="#e3c57e"/>');
const solid=image('<rect width="120" height="120" fill="#614e32"/>');
const fence=image('<rect width="60" height="120" fill="#806340"/>');
const room=image('<rect width="800" height="1000" fill="#224735"/>',800,1000);
const parts=["head","top","left_arm","right_arm","left_leg","right_leg","left_foot","right_foot"].map((partType,i)=>({
  partType,imageUrl:art,xPct:50+(i%3-1)*7,yPct:20+i*8,widthPct:22,
  pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:10+i,
}));
const outfit={category:"bottom",inventoryId:"pants-owned",shopItemId:"pants-shop",name:"Forest Pants",
  imageUrl:art,segments:[{partType:"left_leg",imageUrl:art,fit:{xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:5},renderPlane:"with_part"}]};
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{
  executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
try {
  for(const [width,height,worldId] of [[320,700,"haunted_woods"],[390,844,"swamp"],[834,1194,"volcanic"]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    const page=await context.newPage();page.setDefaultTimeout(12000);
    await page.clock.setFixedTime(new Date("2026-11-26T23:00:00Z"));
    const errors=[],writes=[];page.on("pageerror",e=>errors.push(e.message));
    const base={worldId,kind:"decor",assetId:null,npcId:null,effectType:null,effectColor:null,terrainKey:null,
      interiorDarkness:30,interiorNightDarkness:null,xPct:.5,yPct:.5,size:120,flipped:false,rotation:0,layer:0,
      decorEffects:[],isWaterSource:false,decorSurface:"barrier",isShop:false,legacyLocationId:null,shopItemIds:[],shopItemPlacements:[]};
    const scene={groundLevel:2,groundTheme:worldId==="swamp"?"swamp":worldId==="volcanic"?"volcanic":"haunted",
      assets:[{id:"fence-art",name:"Fence",kind:"decor",worldId,imageUrl:fence},
        {id:"grass-art",name:"Walkable mat",kind:"decor",worldId,imageUrl:solid},
        {id:"room-art",name:"Shop",kind:"building",worldId,imageUrl:solid,interiorImageUrl:room}],
      placements:[{...base,id:"fence",assetId:"fence-art",xPct:.56,yPct:.5,size:120},
        {...base,id:"mat",assetId:"grass-art",xPct:.46,yPct:.5,decorSurface:"ground",size:150},
        {...base,id:"building",kind:"building",assetId:"room-art",xPct:.5,yPct:.45,size:180},
        {...base,id:"water",kind:"terrain",effectType:"water_path",xPct:.5,yPct:.58,size:300},
        {...base,id:"light",kind:"effect",effectType:"lamp_light",xPct:.5,yPct:.54,size:70}],
      interiorItems:[],linkedPages:[],npcs:[]};
    await page.route("**/api/**",route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      if(req.method()!=="GET")writes.push(path);
      if(path==="/api/player-avatar")return route.fulfill({json:{created:true,base:{id:"base",name:"Masc",parts},equipped:[outfit],ownedClothing:[],unavailableEquipmentSlots:[],revision:1}});
      if(path===`/api/worlds/${worldId}/player-scene`)return route.fulfill({json:scene});
      return route.fulfill({json:[]});
    });
    await page.goto(`http://127.0.0.1:4293/world?world=${worldId}`);
    const actor=page.getByTestId("player-world-avatar"), rig=actor.getByTestId("player-character-renderer"), joy=page.getByTestId("floating-joystick");
    await actor.waitFor({state:"visible"});
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid="player-world-avatar"] [data-character-part]').length===8);
    assert.equal(await rig.locator("[data-clothing-part]").count(),1);
    const position=()=>page.evaluate(()=>{
      const a=document.querySelector('[data-testid="player-world-avatar"]').getBoundingClientRect();
      const w=document.querySelector('[data-testid="player-new-world-art"]').getBoundingClientRect();
      return {x:(a.x+a.width/2-w.x)/w.width,y:(a.y+a.height*.94-w.y)/w.height,panX:w.x,panY:w.y};
    });
    const cdp=await context.newCDPSession(page);
    const x=Math.round(width*.20),y=Math.round(height*.72);
    const touch=(type,points)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:points});
    const start=async(dx,dy)=>{
      await touch("touchStart",[{x,y,id:1}]);
      assert.equal(await joy.count(),0,"no permanent joystick or visible joystick on a tap");
      await touch("touchMove",[{x:x+dx,y:y+dy,id:1}]);
      await joy.waitFor({state:"visible"});
      assert.equal(await joy.getAttribute("data-world-theme"),worldId);
    };
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-new-world-object-fence"] img')?.naturalWidth>0);
    const initial=await position();
    await start(45,0);
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-world-avatar"] [data-character-motion="walk"]'));
    // Rightward walking stops at the opaque fence, not at the viewport edge.
    await page.waitForFunction(()=>{
      const a=document.querySelector('[data-testid="player-world-avatar"]').getBoundingClientRect(), w=document.querySelector('[data-testid="player-new-world-art"]').getBoundingClientRect();
      return (a.x+a.width/2-w.x)/w.width>.534;
    });
    await page.waitForTimeout(350);
    const blocked=await position();
    assert.ok(blocked.x>initial.x+.03 && blocked.x<=.539,`opaque fence stops actor: ${JSON.stringify(blocked)}`);
    await touch("touchEnd",[]);
    await joy.waitFor({state:"hidden"});
    await page.waitForFunction(()=>document.querySelector('[data-testid="player-world-avatar"] [data-character-motion="idle"]'));
    assert.equal(await page.getByTestId("player-new-world-building").count(),0);
    const stopped=await position();
    await page.waitForTimeout(150);
    assert.deepEqual(await position(),stopped,"release immediately stops walking and camera");
    await start(-45,0);
    await page.waitForFunction(before=>{
      const w=document.querySelector('[data-testid="player-new-world-art"]').getBoundingClientRect();
      return w.x>before+10;
    },blocked.panX,{timeout:10000});
    await touch("touchCancel",[]);
    await joy.waitFor({state:"hidden"});
    const afterCancel=await position();
    await page.waitForTimeout(180);
    assert.deepEqual(await position(),afterCancel,"cancel never leaves a stuck joystick");
    // A real second finger switches an ongoing walk into pinch and does not
    // resume movement when just one finger remains.
    await start(40,0);
    await touch("touchStart",[{x:x+40,y,id:1},{x:x+130,y:y-55,id:2}]);
    await joy.waitFor({state:"hidden"});
    const beforePinch=await page.getByTestId("player-new-world-art").boundingBox();
    await touch("touchMove",[{x:x+20,y,id:1},{x:x+155,y:y-55,id:2}]);
    await touch("touchEnd",[]);
    await page.waitForFunction(before=>document.querySelector('[data-testid="player-new-world-art"]').getBoundingClientRect().width>before*1.04,beforePinch.width);
    assert.equal(await joy.count(),0);
    // Dragging over an interactive building must not accidentally open it.
    const building=page.getByTestId("player-new-world-object-building");
    const box=await building.boundingBox(), bx=Math.round(box.x+box.width/2), by=Math.round(box.y+box.height/2);
    await touch("touchStart",[{x:bx,y:by,id:1}]);
    await touch("touchMove",[{x:bx-32,y:by,id:1}]);
    await joy.waitFor({state:"visible"});
    await touch("touchEnd",[]);
    await joy.waitFor({state:"hidden"});
    assert.equal(await page.getByTestId("player-new-world-building").count(),0);
    // A simple building tap still opens the room after joystick and pinch.
    await building.tap();
    await page.getByTestId("player-new-world-building").waitFor({state:"visible"});
    assert.equal(await actor.count(),0,"outdoor avatar cannot overlay the interior");
    await page.getByRole("button",{name:"Close building"}).tap();
    await actor.waitFor({state:"visible"});
    assert.equal(await joy.count(),0);
    assert.deepEqual(writes,[],"walking never writes player or authored scene data");
    assert.deepEqual(errors,[]);
    await cdp.detach();await context.close();
    console.log("PASS world joystick, barrier, camera, pinch and building",width,height,worldId);
  }
} finally {await browser.close();await server.close();}
