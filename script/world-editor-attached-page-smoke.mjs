import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real editor and wheel dialog, isolated mock API; no player spins or production writes.
const moduleId = "/__world-editor-attached-page-fixture.tsx";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {getQueryFn} from "@/lib/queryClient";
import {TooltipProvider} from "@/components/ui/tooltip";
import WorldSceneEditorPage from "@/pages/WorldSceneEditorPage";
import "@/index.css";
const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><TooltipProvider><WorldSceneEditorPage worldId="haunted_woods"/></TooltipProvider></QueryClientProvider>);
`;
const server = await createServer({server:{host:"127.0.0.1",port:4198,strictPort:true},
  plugins:[{name:"world-editor-attached-page-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:50"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });}}]});
const art = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect x="26" y="26" width="188" height="188" fill="#927a55"/></svg>').toString("base64");
const room = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#62513b"/></svg>').toString("base64");
const worldId = "haunted_woods";
const asset = (id,kind,name,interiorImageUrl=null) => ({id,worldId,kind,name,imageUrl:art,interiorImageUrl,nightInteriorImageUrl:null,tapImageUrl:null});
const place = (id,kind,xPct,yPct,legacyLocationId=null) => ({id,worldId,kind,assetId:id,xPct,yPct,size:115,legacyLocationId,
  npcId:null,terrainKey:null,effectType:null,effectColor:null,interiorDarkness:35,interiorNightDarkness:null,
  flipped:false,layer:0,decorEffects:[],isWaterSource:false,decorSurface:"barrier",isShop:false,shopItemIds:[],shopItemPlacements:[]});
const createScene = () => ({assets:[asset("spin","decor","Haunted Spin"),asset("ordinary","decor","Ordinary Decor"),
  asset("room","building","Cabin",room),asset("legacy","building","Original Hall")],
  placements:[place("spin","decor",.39,.37),place("ordinary","decor",.61,.37),
    place("room","building",.39,.56),place("legacy","building",.61,.56,"original-hall")],interiorItems:[]});
const wheel = (isAdmin=true) => ({ready:false,layout:{left:26.6,top:21.6,size:46.8},pointerLayout:{x:50,y:15.1,size:40},ghostLayout:{x:84,y:25,size:22},
  slots:Array.from({length:8},(_,slot)=>({slot,configured:false,kind:null,label:"Empty",imageUrl:null,amount:null,shopItemId:null})),
  requiresActivePet:false,activePetReady:true,activePetName:"Fixture Pet",balances:{coins:5000,essence:10},freeSpinAvailable:true,nextSpinCost:0,isAdmin});
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
try {
  for(const [name,width,height,touch] of [["phone",390,844,true],["tablet",834,1194,true],["desktop",1100,900,false]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,timezoneId:"UTC"});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const scene=createScene(), writes=[],errors=[];
    let reads=0, legacyReads=0, admin=true, legacyAvailable=true;
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/world-assets/uploads/HauntedSpin*.png",route=>route.fulfill({path:resolve("attached_assets/uploads",new URL(route.request().url()).pathname.split("/").pop()),contentType:"image/png"}));
    await page.route("**/api/**",route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      if(req.method()!=="GET")writes.push({path,body:req.postDataJSON()});
      if(path==="/api/auth/me")return route.fulfill({json:{id:"qa",isAdmin:true,emailVerified:true,timeZone:"UTC"}});
      if(path==="/api/world-scene-publications")return route.fulfill({json:[{worldId,active:false,hasBeenLive:false}]});
      if(path==="/api/admin/world-editor/haunted_woods/draft")return route.fulfill({json:{worldId,groundLevel:1,groundTheme:"haunted",hasSavedDraft:true}});
      if(path==="/api/admin/world-editor/haunted_woods/scene")return route.fulfill({json:scene});
      if(path.endsWith("/legacy-pages")){legacyReads++;return route.fulfill({json:legacyAvailable?[{id:"original-hall",worldId:"swamp",name:"Original Hall",type:"scenic",bgUrl:room}]:[]});}
      if(path==="/api/beau-prize-wheel"){reads++;return route.fulfill({json:wheel(admin)});}
      if(req.method()==="PATCH" && path.includes("/placements/")){
        const item=scene.placements.find(item=>item.id===path.split("/").pop());
        Object.assign(item,req.postDataJSON());return route.fulfill({json:item});
      }
      return route.fulfill({json:[]});
    });
    await page.goto("http://127.0.0.1:4198/world-editor/haunted_woods",{waitUntil:"commit"});
    const target=id=>page.getByTestId("world-scene-placement-"+id), overlay=page.getByTestId("beau-prize-wheel-overlay");
    const controls=page.getByTestId("world-scene-selected-controls");
    const press=async (x,y)=>touch?page.touchscreen.tap(x,y):page.mouse.click(x,y);
    const center=async locator=>{const b=await locator.boundingBox();assert.ok(b,name+": visible artwork");return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const tap=async id=>{const p=await center(target(id));await press(p.x,p.y);};
    const pair=async id=>{const p=await center(target(id));if(touch){await press(p.x,p.y);await press(p.x,p.y);}else await page.mouse.dblclick(p.x,p.y,{delay:30});};
    await target("spin").waitFor();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll("[data-world-editor-artwork] img")).every(i=>i.complete&&i.naturalWidth>0));
    assert.equal(reads,0,"no wheel status poll in editor");
    // Transparent padding and the first two clicks from unselected must not launch.
    const b=await target("spin").boundingBox();await press(b.x+b.width*.03,b.y+b.height*.03);
    assert.equal(await controls.count(),0);
    await pair("spin");await controls.waitFor();assert.equal(await overlay.count(),0);
    assert.equal(reads,0,"selection is not half of the double tap");
    await page.waitForTimeout(520);
    await tap("spin");await page.waitForTimeout(520);assert.equal(await overlay.count(),0);
    assert.equal(reads,0,"one selected tap doesn't open");
    // A selected drag still saves placement, never opens the wheel.
    const p=await center(target("spin")), before={...scene.placements[0]};
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+19,p.y+12,{steps:5});await page.mouse.up();
    await page.waitForTimeout(250);
    assert.notDeepEqual(scene.placements[0],before,"selected drag moved placement");
    assert.equal(writes.length,1);assert.equal(reads,0);
    // One tap then pan/pinch then another must not be recognized as a pair.
    await tap("spin");
    const v=await page.getByTestId("world-scene-draft-viewport").boundingBox();
    await page.mouse.move(v.x+12,v.y+v.height*.48);await page.mouse.down();await page.mouse.move(v.x+22,v.y+v.height*.48+15,{steps:2});await page.mouse.up();
    await tap("spin");assert.equal(reads,0,"pan cancels pending tap pair");
    if(touch){
      // Start a genuine two-finger pinch with one finger on the selected decor.
      const c=await center(target("spin")), cdp=await context.newCDPSession(page);
      const a={x:c.x,y:c.y,id:1}, b={x:c.x+60,y:c.y,id:2};
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[a]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[a,b]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...a,x:a.x-9},{...b,x:b.x+9}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      await tap("spin");
      assert.equal(reads,0,"pinch invalidates a pending tap");
      assert.equal(writes.length,1,"pinch never moves selected art");
      await cdp.detach();
    }
    await page.waitForTimeout(520);
    const cameraBefore=await page.locator("[data-world-editor-artwork]").getAttribute("style");
    const selectedBefore=await target("spin").boundingBox();
    await pair("spin");await overlay.waitFor({state:"visible"});
    assert.equal(reads,1);assert.equal(writes.length,1,"opening is read-only");
    await page.getByTestId("beau-select-layer-arrow").waitFor();
    assert.equal(await page.getByTestId("button-spin-beau-prize-wheel").isDisabled(),true,"unconfigured wheel can still open for admin setup");
    await page.getByRole("button",{name:"Close Beau's Prize Wheel"}).click();await overlay.waitFor({state:"hidden"});
    assert.equal(await page.locator("[data-world-editor-artwork]").getAttribute("style"),cameraBefore);
    assert.deepEqual(await target("spin").boundingBox(),selectedBefore);
    assert.match(await controls.innerText(),/Haunted Spin/);
    // In case of a stale auth session, player state can't open an editor preview.
    admin=false;await pair("spin");await page.getByText("Only an admin can open the wheel from the world editor.").waitFor();
    assert.equal(await overlay.count(),0);admin=true;
    await tap("ordinary");await pair("ordinary");assert.equal(await overlay.count(),0);assert.equal(reads,2);
    const cameraRoom=await page.locator("[data-world-editor-artwork]").getAttribute("style");
    await tap("room");await controls.getByText("Cabin",{exact:true}).waitFor();
    await pair("room");await page.getByTestId("world-editor-interior").waitFor();
    await page.getByRole("button",{name:"Exit Room"}).click();
    assert.equal(await page.locator("[data-world-editor-artwork]").getAttribute("style"),cameraRoom);
    assert.match(await controls.innerText(),/Cabin/);
    // A verified linked original page routes directly to its actual legacy page.
    legacyAvailable=false;
    await tap("legacy");await controls.getByText("Original Hall",{exact:true}).waitFor();
    const previousLegacyReads=legacyReads;
    await pair("legacy");await page.waitForTimeout(300);
    assert.ok(legacyReads>previousLegacyReads,"linked page verified before launching");
    assert.match(page.url(),/world-editor\/haunted_woods$/,"missing original page stays in editor");
    legacyAvailable=true;
    await page.waitForTimeout(520);
    await pair("legacy");
    await page.waitForURL("**/world/swamp?legacyLocationId=original-hall&returnEditor=haunted_woods");
    assert.equal(writes.length,1,"only intended drag wrote scene position");
    assert.deepEqual(errors,[]);
    await context.close();
    console.log("PASS "+name+": selected-only double tap, no accidental drag/pan/pinch open, real admin wheel, ordinary decor, room return and legacy route");
  }
} finally {await browser.close();await server.close();}
