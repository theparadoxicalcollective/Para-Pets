import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real room renderer and touch/pointer handling; mock only server responses.
const moduleId = "/__world-scene-soul-exchange-fixture.tsx";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClientProvider} from "@tanstack/react-query";
import {queryClient} from "@/lib/queryClient";
import WorldScenePlayerPage from "@/pages/WorldScenePlayerPage";
import "@/index.css";
createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}><WorldScenePlayerPage worldId="haunted_woods"/></QueryClientProvider>);
`;
const server = await createServer({
  server: {host:"127.0.0.1",port:4205,strictPort:true},
  plugins:[{name:"world-scene-soul-exchange-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:50"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });}}]
});
const image=(w,h,color)=>"data:image/svg+xml;base64,"+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`).toString("base64");
const art=image(200,200,"#b56ce2"), room=image(700,1100,"#271438");
const worldId="haunted_woods";
const asset=(id,name,kind="decor",interiorImageUrl=null)=>({id,worldId,kind,name,imageUrl:art,interiorImageUrl,nightInteriorImageUrl:null,tapImageUrl:null});
const base={worldId,npcId:null,assetId:null,kind:"building",effectType:null,effectColor:null,terrainKey:null,
  interiorDarkness:35,interiorNightDarkness:null,xPct:.5,yPct:.5,size:200,flipped:false,layer:0,decorEffects:[],
  isWaterSource:false,decorSurface:"barrier",isShop:false,legacyLocationId:null,shopItemIds:[],shopItemPlacements:[]};
const scene={groundLevel:1,groundTheme:"haunted",assets:[asset("building-art","Soul Exchange","building",room),asset("stone-art","The Soul Exchange Stone"),asset("ordinary-art","Soul Exchange Stone Sign")],
  placements:[{...base,id:"building",assetId:"building-art"}],
  interiorItems:[
    {id:"stone",worldId,buildingId:"building",kind:"decor",assetId:"stone-art",effectType:null,xPct:.5,yPct:.42,size:420,flipped:false},
    {id:"ordinary",worldId,buildingId:"building",kind:"decor",assetId:"ordinary-art",effectType:null,xPct:.15,yPct:.19,size:80,flipped:false},
  ], linkedPages:[],npcs:[]};
const pet=(inventoryId,name,petLevel,rarity,essenceValue,eligible=true)=>({inventoryId,name,petLevel,rarity,essenceValue,eligible,imageUrl:art});
await server.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
  for(const [name,width,height,mobile] of [["phone",390,844,true],["tablet",834,1194,true],["desktop",1280,900,false]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    const writes=[],errors=[];
    let pets=[pet("a","Shade",17,3,300),pet("b","Wisp",8,2,125),pet("blocked","Protected",5,4,750,false)];
    let essence=1000,fail=true,reads=0;
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",async route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      if(path==="/api/worlds/haunted_woods/player-scene")return route.fulfill({json:scene});
      if(path==="/api/auth/me")return route.fulfill({json:{id:"qa",username:"QA",essence,isAdmin:false}});
      if(path==="/api/soul-exchange/pets"){reads++;return route.fulfill({json:{pets,essence}});}
      if(path==="/api/soul-exchange/exchange"){
        const body=req.postDataJSON();writes.push(body);
        assert.deepEqual(body.petInventoryIds,["a"]);
        assert.match(body.exchangeActionId,/^[0-9a-f-]{36}$/);
        if(fail){fail=false;return route.fulfill({status:409,json:{message:"The ritual could not be completed. Try again."}});}
        await new Promise(resolve=>setTimeout(resolve,200));
        pets=pets.filter(p=>p.inventoryId!=="a");essence+=300;
        return route.fulfill({json:{success:true,exchangedPets:[{inventoryId:"a"}],essenceAwarded:300,newEssenceBalance:essence}});
      }
      return route.fulfill({json:[]});
    });
    await page.goto("http://127.0.0.1:4205/world/haunted_woods");
    const building=page.getByTestId("player-new-world-object-building");
    if(mobile)await building.tap();else await building.click();
    const stone=page.getByTestId("world-soul-exchange-stone"),tray=page.getByTestId("world-soul-exchange");
    await stone.waitFor({state:"visible"});
    assert.equal(reads,0,"do not fetch pets when a room is entered");
    assert.equal(await tray.count(),0);
    assert.equal(await page.getByTestId("player-new-world-enter-linked-page").count(),0,"no old page is required");
    await stone.click();
    const petCard=tray.getByTestId("soul-exchange-pet-a"),handle=tray.getByTestId("soul-exchange-drag-a");
    await petCard.waitFor({state:"visible"});
    const stoneBounds=await stone.boundingBox(),trayBounds=await tray.getByRole("region",{name:"Available pets for Soul Exchange"}).boundingBox();
    assert.ok(stoneBounds&&trayBounds);
    assert.ok(Math.abs(trayBounds.y-stoneBounds.y-stoneBounds.height)<20,"tray sits just below the stone when room allows");
    assert.match(await petCard.innerText(),/Shade/);
    assert.match(await petCard.innerText(),/Lvl 17/);
    assert.match(await petCard.innerText(),/★★★/);
    assert.match(await petCard.innerText(),/300/);
    assert.equal(await petCard.locator('button img').getAttribute("src"),art);
    assert.equal(await tray.getByTestId("soul-exchange-pet-blocked").count(),0);
    const balance=tray.getByTestId("soul-exchange-essence-balance");
    assert.match(await balance.innerText(),/1,000/);
    const dialog=page.getByTestId("soul-exchange-confirmation");
    const session=mobile?await context.newCDPSession(page):null;
    const drag=async (valid=true)=>{
      const start=await handle.boundingBox(),target=await stone.boundingBox();
      assert.ok(start&&target);
      const from={x:start.x+start.width/2,y:start.y+start.height/2};
      const to=valid?{x:target.x+target.width/2,y:target.y+target.height/2}:{x:8,y:8};
      if(session){
        await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...from,id:1}]});
        for(let i=1;i<=8;i++)await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8}]});
        await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      }else{
        await page.mouse.move(from.x,from.y);await page.mouse.down();
        await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
      }
    };
    await drag(false);
    assert.equal(await dialog.count(),0,"dropping away from the stone must not confirm");
    assert.equal(writes.length,0);
    await drag();
    await dialog.waitFor({state:"visible"});
    assert.match(await dialog.innerText(),/Shade[\s\S]*300 Essence/);
    assert.equal(writes.length,0,"dropping alone must never exchange a pet");
    await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
    await dialog.waitFor({state:"detached"});
    assert.equal(writes.length,0);
    await drag();
    await dialog.waitFor({state:"visible"});
    await dialog.getByRole("button",{name:"Confirm",exact:true}).click();
    await dialog.getByRole("alert").waitFor({state:"visible"});
    assert.equal(writes.length,1);
    assert.ok(await petCard.isVisible());
    assert.match(await balance.innerText(),/1,000/);
    await dialog.getByRole("button",{name:"Confirm",exact:true}).click();
    const reward=tray.getByTestId("soul-exchange-reward");
    await reward.waitFor({state:"visible"});
    assert.match(await reward.innerText(),/\+300 Essence/);
    assert.equal(writes.length,2);
    assert.equal(writes[0].exchangeActionId,writes[1].exchangeActionId,"retry uses the same action");
    assert.equal(await petCard.count(),0);
    assert.match(await balance.innerText(),/1,300/);
    assert.equal(await tray.getByTestId("soul-exchange-pet-b").count(),1);
    assert.equal(reads,1);
    await tray.getByRole("button",{name:"Close Soul Exchange"}).click();
    await tray.waitFor({state:"detached"});
    assert.ok(await stone.isVisible());
    await page.getByRole("button",{name:"Close building"}).click();
    await page.getByTestId("player-new-world-object-building").waitFor({state:"visible"});
    assert.deepEqual(errors,[],name+": no runtime errors");
    await context.close();
    console.log(name+": soul exchange drag/confirmation/retry/reward passed");
  }
}finally{await browser?.close();await server.close();}
