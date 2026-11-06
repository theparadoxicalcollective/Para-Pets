import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real PetParkPage: staged garden and other-player pet under the actual
// viewport camera. All network writes are intercepted; no Railway game data.
const moduleId = "/__garden-player-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
  'import {getQueryFn} from "@/lib/queryClient";',
  'import {TooltipProvider} from "@/components/ui/tooltip";',
  'import PetParkPage from "@/pages/PetParkPage";',
  'import "@/index.css";',
  'const q=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={q}><TooltipProvider><PetParkPage/></TooltipProvider></QueryClientProvider>);',
].join("\n");
const server = await createServer({server:{host:"127.0.0.1",port:4189,strictPort:true},plugins:[{
  name:"garden-player-fixture",
  resolveId:id=>id===moduleId?id:null,
  load:id=>id===moduleId?fixture:null,
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html"))return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
  });},
}]});
const art="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="90" r="70" fill="#588c4b"/></svg>',
).toString("base64");
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    page.setDefaultTimeout(16000);
    const errors=[],requests=[],replays=new Map();
    const plot={ plotItemId:"plot1",xPct:.5,yPct:.5,size:150,phase:"empty",
      cropId:null,waterApplied:0,harvestReady:false,pickedUntil:null };
    const crop={id:"crop1",seedItemId:"seed-item",fruitItemId:"fruit-item",
      seedName:"Forest Tomato Seeds",fruitName:"Forest Tomato",ready:true,
      images:{seedPack:art,planted:art,seedling:art,partial:art,grown:art,picked:art,fruit:art},
      drops:{planted:1,seedling:1,partial:1,grown:1} };
    const scene={
      enabledForPlayers:true,canEnterPark:true,canEditPark:false,groundLevel:1,backgroundUrl:null,
      groundTheme:"grass",buildings:[],deposits:[],unlockedSlots:1,
      sharedPets:[{petInventoryId:"another-pet",petTemplateId:null,hatchedImageUrl:art,petName:"Visitor",
        petNickname:null,petLevel:10,rarity:3,ownerName:"Friend",ownerId:"friend-id",depositedAt:new Date().toISOString(),
        buildingId:null,roomEffectId:null,parkXPct:.62,parkYPct:.55,interiorXPct:0,interiorYPct:0,pose:"idle"}],
      items:[{id:"plot1",kind:"terrain",effectType:"garden_plot",isWaterSource:false,imageUrl:null,
        xPct:.5,yPct:.5,size:150,flipped:false,layer:0}],
    };
    let inventory=[
      {inventoryId:"hoe",shopItemId:"hoe-item",name:"Hoe",type:"garden_tool",specialType:"hoe",quantity:1,isListed:false,imageUrl:art},
      {inventoryId:"scythe",shopItemId:"scythe-item",name:"Scythe",type:"garden_tool",specialType:"scythe",quantity:1,isListed:false,imageUrl:art},
      {inventoryId:"seed",shopItemId:"seed-item",name:"Forest Tomato Seeds",type:"garden_seed",quantity:2,isListed:false,imageUrl:art},
      {inventoryId:"seed-listed",shopItemId:"seed-item",name:"Market Seeds",type:"garden_seed",quantity:9,isListed:true,imageUrl:art},
      {inventoryId:"pail",shopItemId:"pail-item",name:"Watering Pail",type:"garden_tool",specialType:"watering_pail",
        quantity:1,isListed:false,isRefillable:true,gardenWaterLeft:10,imageUrl:art},
    ];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{
      const url=new URL(route.request().url()),p=url.pathname;
      if(p==="/api/pet-park/scene")return route.fulfill({json:scene});
      if(p==="/api/inventory")return route.fulfill({json:inventory});
      if(p==="/api/pet-park/garden")return route.fulfill({json:{serverNow:new Date().toISOString(),plots:[plot],crops:[crop]}});
      if(p==="/api/pet-park/status")return route.fulfill({json:{enabledForPlayers:true,canEnterPark:true}});
      const match=p.match(/^\/api\/pet-park\/garden\/plots\/plot1\/(hoe|plant|water|harvest)$/);
      if(match){
        const action=match[1],body=route.request().postDataJSON();
        if(replays.has(body.requestId))return route.fulfill({json:{...replays.get(body.requestId),replayed:true}});
        assert.match(body.requestId,/^[a-f0-9-]{36}$/i);
        assert.deepEqual(Object.keys(body).sort(),["inventoryId","requestId"]);
        requests.push({action,...body});
        if(action==="hoe"){
          assert.equal(plot.phase,"empty");assert.equal(body.inventoryId,"hoe");plot.phase="tilled";
        }else if(action==="plant"){
          assert.equal(plot.phase,"tilled");assert.equal(body.inventoryId,"seed");plot.phase="planted";plot.cropId=crop.id;
          inventory=inventory.map(x=>x.inventoryId==="seed"?{...x,quantity:1}:x);
        }else if(action==="water"){
          assert.equal(body.inventoryId,"pail");assert.notEqual(plot.harvestReady,true);
          const next={planted:"seedling",seedling:"partial",partial:"grown",grown:"grown"};
          plot.phase=next[plot.phase];plot.waterApplied=0;
          if(plot.phase==="grown" && requests.filter(x=>x.action==="water").length===4){plot.harvestReady=true;plot.waterApplied=1;}
          inventory=inventory.map(x=>x.inventoryId==="pail"?{...x,gardenWaterLeft:x.gardenWaterLeft-1}:x);
        }else {
          assert.equal(plot.phase,"grown");assert.equal(plot.harvestReady,true);
          assert.equal(body.inventoryId,"scythe");plot.phase="picked";plot.harvestReady=false;
          plot.pickedUntil=new Date(Date.now()+30000).toISOString();
          inventory.push({inventoryId:"fruit",shopItemId:"fruit-item",name:crop.fruitName,type:"garden_fruit",quantity:2,isListed:false,imageUrl:art});
        }
        const result={plot:{...plot},replayed:false,
          ...(action==="harvest"?{reward:{fruitItemId:"fruit-item",quantity:2}}:{}),
          ...(action==="water"?{waterLeft:inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft}:{})};
        replays.set(body.requestId,result);
        return route.fulfill({json:result});
      }
      return route.fulfill({json:{}});
    });
    await page.goto("http://127.0.0.1:4189/fixture",{waitUntil:"commit",timeout:30000});
    const ground=page.getByTestId("pet-park-garden-plot");
    await ground.waitFor({state:"visible",timeout:30000});
    await page.getByTestId("pet-park-untilled-soil").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("pet-park-untilled-soil").count(),1);

    // The visitor's physical artwork and hit area must scale with the same
    // ratio as terrain, at zoom in AND zoom out, on phones and tablets.
    const pet=page.locator('[data-park-pet="another-pet"]');
    await pet.waitFor({state:"visible"});
    const dimensions=async()=>page.evaluate(()=>{
      const pet=document.querySelector('[data-park-pet-world-scale]').getBoundingClientRect();
      const tile=document.querySelector('[data-testid="pet-park-garden-plot"]').getBoundingClientRect();
      const hit=document.querySelector('[data-testid="pet-park-outdoor-inspect"]').getBoundingClientRect();
      return {pet:pet.width,tile:tile.width,hit:hit.width};
    });
    const before=await dimensions();
    await page.locator('[data-testid="pet-park-painterly-terrain"]').evaluate(node=>
      node.parentElement.dispatchEvent(new WheelEvent("wheel",{deltaY:-300,cancelable:true,bubbles:true})));
    await page.waitForFunction(width=>document.querySelector('[data-park-pet-world-scale]').getBoundingClientRect().width>width+1,before.pet);
    const afterZoomIn=await dimensions();
    assert.ok(afterZoomIn.pet>before.pet && afterZoomIn.tile>before.tile && afterZoomIn.hit>before.hit,name+": visitor, hit target and terrain all grow together");
    const r1=afterZoomIn.pet/before.pet,r2=afterZoomIn.tile/before.tile;
    assert.ok(Math.abs(r1-r2)<.035,name+": visitor size follows scene zoom, not an inverse scale");
    await page.locator('[data-testid="pet-park-painterly-terrain"]').evaluate(node=>
      node.parentElement.dispatchEvent(new WheelEvent("wheel",{deltaY:900,cancelable:true,bubbles:true})));
    await page.waitForFunction(width=>document.querySelector('[data-park-pet-world-scale]').getBoundingClientRect().width<width-1,afterZoomIn.pet);
    const afterZoomOut=await dimensions();
    assert.ok(afterZoomOut.pet<afterZoomIn.pet && afterZoomOut.tile<afterZoomIn.tile && afterZoomOut.hit<afterZoomIn.hit,name+": visitor, hit target and terrain all shrink together");

    await ground.click();
    const menu=page.getByTestId("pet-park-garden-menu");
    await menu.waitFor({state:"visible"});
    assert.equal(await page.getByRole("dialog",{name:"Garden Plot"}).count(),0,
      name+": garden tools never open a full-screen modal");
    // Each plot opens four world-anchored bubbles. Only the current stage
    // can be used; one tool tap must send exactly one authenticated request.
    const arc=menu.locator('[role="group"][aria-label="Garden tools"]');
    await arc.waitFor({state:"visible"});
    assert.equal(await menu.locator(".garden-tool-bubble").count(),4);
    const anchor=await menu.getByTestId("pet-park-garden-anchor").boundingBox();
    const plotBounds=await ground.boundingBox();
    assert.ok(anchor && plotBounds && Math.abs(anchor.x+anchor.width/2-(plotBounds.x+plotBounds.width/2))<4,
      name+": tool bubbles follow the world-positioned plot");

    const apply=async(label,expectedPhase)=>{
      const count=requests.length;
      const button=menu.getByRole("button",{name:label,exact:true});
      await button.click();
      const motion=menu.getByTestId("pet-park-garden-animation");
      await motion.waitFor({state:"visible"});
      assert.equal(await motion.getAttribute("data-action"),label.toLowerCase());
      const expectedAnimation={Hoe:"garden-hoe-chops",Plant:"garden-seed-drop",
        Water:"garden-pail-tip",Harvest:"garden-scythe-sweep"}[label];
      const actualAnimation=await motion.locator(".garden-tool-motion").evaluate(node=>
        getComputedStyle(node).animationName);
      assert.equal(actualAnimation,expectedAnimation,name+": tool motion matches intended image orientation");
      await menu.getByTestId("pet-park-garden-stage").getByText(expectedPhase,{exact:true}).waitFor({state:"visible"});
      assert.equal(requests.length,count+1,name+": one request for one "+label+" tap");
      if(label==="Water"){
        const bar=menu.getByTestId("pet-park-garden-water-gauge");
        await bar.waitFor({state:"visible"});
        const expectedLeft=inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft;
        await bar.getByText(expectedLeft+" / 100").waitFor({state:"visible"});
      }
      await motion.waitFor({state:"hidden",timeout:8000});
    };
    for(const other of ["Plant","Water","Harvest"])
      assert.equal(await menu.getByRole("button",{name:other,exact:true}).isDisabled(),true,
        name+": future tools are visibly disabled");
    await apply("Hoe","Tilled soil");
    await page.getByTestId("pet-park-tilled-soil").waitFor({state:"visible"});
    await apply("Plant","Planted seed");
    assert.equal(await menu.getByText("Market Seeds").count(),0,"listed seeds cannot be selected");
    await page.getByTestId("pet-park-garden-crop").waitFor({state:"visible"});
    await apply("Water","Seedling");
    await apply("Water","Partially grown");
    await apply("Water","Fully grown");
    await apply("Water","Ready to harvest");
    assert.equal(inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft,6);
    await apply("Harvest","Recently harvested");
    await menu.getByTestId("pet-park-garden-harvest").waitFor({state:"visible"});
    assert.match(await menu.getByTestId("pet-park-garden-harvest").innerText(),/2 × Forest Tomato/);
    assert.equal(inventory.find(x=>x.inventoryId==="fruit").quantity,2);
    assert.equal(requests.length,7);
    await menu.getByRole("button",{name:"Close harvest notice"}).click();
    await menu.getByRole("button",{name:"Close garden tools"}).click();
    await ground.click();
    await menu.getByTestId("pet-park-garden-stage").getByText("Recently harvested").waitFor({state:"visible"});
    await menu.getByRole("button",{name:"Close garden tools"}).click();
    assert.deepEqual(errors,[],name+": no client runtime errors");
    console.log("PASS "+name+": actual Garden Plot hoe/seed/4 drops/harvest, tilled art, market exclusion, and common visitor/terrain zoom");
    await context.close();
  }
}finally{await browser.close();await server.close();}
