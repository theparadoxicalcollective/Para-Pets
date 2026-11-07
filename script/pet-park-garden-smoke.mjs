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
// Mimic a player-uploaded transparent PNG: visible sprout is at the top
// RIGHT of its canvas, so naïve image centering places it off the plot.
const cropArt="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="150" y="20" width="35" height="50" fill="#58a44b"/></svg>',
).toString("base64");
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    page.setDefaultTimeout(16000);
    const errors=[],requests=[],replays=new Map();
    let slotUnlockCalls=0;
    let shopPurchases=0;
    const plot={ plotItemId:"plot1",xPct:.5,yPct:.5,size:150,phase:"empty",
      cropId:null,waterApplied:0,harvestReady:false,pickedUntil:null };
    const crop={id:"crop1",seedItemId:"seed-item",fruitItemId:"fruit-item",
      seedName:"Forest Tomato Seeds",fruitName:"Forest Tomato",ready:true,
      images:{seedPack:art,planted:cropArt,seedling:cropArt,partial:cropArt,grown:cropArt,picked:cropArt,fruit:art},
      drops:{planted:15,seedling:7,partial:12,grown:5},
      stagePlacements:{planted:{x:.12,y:-.05,scale:.35}} };
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
        quantity:1,isListed:false,isRefillable:true,gardenWaterLeft:100,imageUrl:art},
    ];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{
      const url=new URL(route.request().url()),p=url.pathname;
      if(p==="/api/pet-park/scene")return route.fulfill({json:scene});
      if(p==="/api/inventory")return route.fulfill({json:inventory});
      if(p==="/api/pet-park/garden")return route.fulfill({json:{serverNow:new Date().toISOString(),plots:[plot],crops:[crop]}});
      if(p==="/api/pet-park/status")return route.fulfill({json:{enabledForPlayers:true,canEnterPark:true}});
      if(p==="/api/auth/me")return route.fulfill({json:{id:"garden-fixture",coins:1000,isAdmin:false}});
      if(p==="/api/shop/pet-park/buy/seed-item"){
        const body=route.request().postDataJSON();
        assert.deepEqual(body,{buildingId:"shop1",quantity:1});
        shopPurchases++;
        return route.fulfill({json:{user:{id:"garden-fixture",coins:875,isAdmin:false},quantity:1,inventory:{id:"bought-seed"}}});
      }
      if(p==="/api/pet-park/buildings/shop1/shop-items")return route.fulfill({json:[
        {id:"seed-item",name:"Forest Tomato Seeds",type:"garden_seed",price:125,imageUrl:art,eggImageUrl:null,hatchedImageUrl:null},
      ]});
      if(p==="/api/pet-park/slots/unlock"){
        const body=route.request().postDataJSON();
        assert.equal(body.slot,3);
        assert.equal(scene.unlockedSlots,2,"must unlock the preceding spot first");
        scene.unlockedSlots=3;
        slotUnlockCalls++;
        return route.fulfill({json:{unlockedSlots:3,charged:5000,coins:500}});
      }
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
          const required=crop.drops[plot.phase],waterAvailable=inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft;
          const poured=Math.min(10,waterAvailable,required-plot.waterApplied);
          assert.ok(poured>0 && poured<=10,"water is charged in bounded units");
          plot.waterApplied+=poured;
          if(plot.waterApplied===required){
            if(plot.phase==="grown")plot.harvestReady=true;
            else{plot.phase={planted:"seedling",seedling:"partial",partial:"grown"}[plot.phase];plot.waterApplied=0;}
          }
          inventory=inventory.map(x=>x.inventoryId==="pail"?{...x,gardenWaterLeft:x.gardenWaterLeft-poured}:x);
          replays.set(body.requestId,{waterUsed:poured}); // overwritten with full response below
        }else {
          assert.equal(plot.phase,"grown");assert.equal(plot.harvestReady,true);
          assert.equal(body.inventoryId,"scythe");plot.phase="picked";plot.harvestReady=false;
          plot.pickedUntil=new Date(Date.now()+30000).toISOString();
          inventory.push({inventoryId:"fruit",shopItemId:"fruit-item",name:crop.fruitName,type:"garden_fruit",quantity:2,isListed:false,imageUrl:art});
        }
        const result={plot:{...plot},replayed:false,
          ...(action==="harvest"?{reward:{fruitItemId:"fruit-item",quantity:2}}:{}),
          ...(action==="water"?{waterLeft:inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft,waterUsed:replays.get(body.requestId)?.waterUsed}:{})};
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

    // The canvas used to expose a hard-edged dark rectangle after fast
    // landscape pans exceeded its small cached-raster overscan. Assert the
    // actual canvas still covers the entire visible Pet Park during a swipe.
    const terrain=page.getByTestId("pet-park-painterly-terrain");
    await terrain.waitFor({state:"visible"});
    const coversViewport=async()=>terrain.evaluate(canvas=>{
      const viewport=canvas.parentElement.getBoundingClientRect();
      const painted=canvas.getBoundingClientRect();
      return canvas.width>0 && canvas.height>0 &&
        painted.left<=viewport.left+.5 && painted.top<=viewport.top+.5 &&
        painted.right>=viewport.right-.5 && painted.bottom>=viewport.bottom-.5;
    });
    assert.equal(await coversViewport(),true,name+": grass raster initially covers full screen");
    await page.mouse.move(width*.80,height*.24);
    await page.mouse.down();
    await page.mouse.move(width*.14,height*.24,{steps:5});
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('[data-testid="pet-park-painterly-terrain"]');
      if(!canvas)return false;
      const viewport=canvas.parentElement.getBoundingClientRect();
      const painted=canvas.getBoundingClientRect();
      return painted.left<=viewport.left+.5 && painted.top<=viewport.top+.5 &&
        painted.right>=viewport.right-.5 && painted.bottom>=viewport.bottom-.5;
    },null,{timeout:9000});
    assert.equal(await coversViewport(),true,name+": fast pan cannot reveal flat dark canvas edge");
    await page.mouse.up();
    // This is a separate gardening interaction scenario. Restore the
    // starting camera after deliberately panning the garden offscreen.
    // Reloading this isolated fixture does not change garden or inventory.
    await page.reload({waitUntil:"commit"});
    await ground.waitFor({state:"visible"});
    await page.waitForFunction(() => {
      const plot=document.querySelector('[data-testid="pet-park-garden-plot"]')?.getBoundingClientRect();
      return !!plot && plot.left>=0 && plot.right<=innerWidth && plot.top>=0 && plot.bottom<=innerHeight;
    },null,{timeout:12000});

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
    assert.ok(anchor && plotBounds,name+": garden arc and plot are visible");
    assert.equal(await menu.getByTestId("pet-park-garden-anchor").getAttribute("data-side"),"right",
      name+": ordinary plot opens tools on its right instead of across its top");
    assert.ok(anchor.x>plotBounds.x+plotBounds.width/2,
      name+": tool arc is beside, not centered over, the garden plot");
    assert.ok(anchor.x+anchor.width<=width+2,
      name+": tool arc stays inside mobile/tablet screen");

    const dismiss=async()=>{
      // Background tap dismisses the tool arc, without a blocking backdrop
      // and without re-opening the same plot on the trailing click.
      await page.mouse.click(20,Math.round(height*.35));
      await menu.waitFor({state:"hidden"});
      // A subsequent intentional opening is distinct from the pointer that
      // just dismissed it; let that anti-reopen window finish.
      await page.waitForTimeout(350);
    };
    assert.equal(await menu.getByRole("button",{name:"Close garden tools"}).count(),0,
      name+": no extra X button is shown");
    // A second tap on the plot itself counts as an outside-menu gesture.
    // Pointer-down closes the bubbles and the trailing click must NOT
    // immediately reopen them.
    await ground.click();
    await menu.waitFor({state:"hidden"});
    await page.waitForTimeout(350); // let the same-gesture suppression window expire
    assert.equal(await menu.count(),0,name+": off-menu plot tap stays dismissed");
    await ground.click();
    await menu.waitFor({state:"visible"});
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
      assert.equal(await menu.locator(".garden-tool-bubble").count(),0,
        name+": tools disappear while "+label+" is animated");
      assert.equal(await menu.getByTestId("pet-park-garden-stage").count(),0,
        name+": soil phase label removed");
      assert.equal(await menu.getByTestId("pet-park-garden-progress").count(),0,
        name+": duplicate text progress removed");
      if(label==="Water" && !plot.harvestReady){
        const bar=page.getByTestId("pet-park-garden-growth-progress");
        await bar.waitFor({state:"visible"});
        assert.equal((await bar.innerText()).trim(),"",name+": only thin water bar, no text or box");
        assert.equal(await bar.getAttribute("role"),"progressbar");
      }
      assert.equal(await menu.getByTestId("pet-park-garden-water-gauge").count(),0,
        name+": no second pail gauge above garden tool animation");
      await motion.waitFor({state:"hidden",timeout:8000});
      await page.getByTestId("pet-park-garden-growth-progress").waitFor({state:"hidden"});
      await menu.locator(".garden-tool-bubble").first().waitFor({state:"visible"});
      assert.equal(plot.phase,expectedPhase,name+": server crop phase remains correct");
      assert.equal(requests.length,count+1,name+": one request for one "+label+" tap");
    };
    for(const other of ["Plant","Water","Harvest"])
      assert.equal(await menu.getByRole("button",{name:other,exact:true}).isDisabled(),true,
        name+": future tools are visibly disabled");
    await apply("Hoe","tilled");
    await page.getByTestId("pet-park-tilled-soil").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("pet-park-tilled-soil").locator("path").count(),2,
      name+": tilled soil has only its two diamond borders; no curved interior furrows");
    await apply("Plant","planted");
    assert.equal(await menu.getByText("Market Seeds").count(),0,"listed seeds cannot be selected");
    await page.getByTestId("pet-park-garden-crop").waitFor({state:"attached"});
    await page.getByTestId("pet-park-garden-visible-art").waitFor({state:"visible"});
    // Scan the crop artwork rather than centering its full 200x200
    // transparent box. The uploaded visible 35x50 patch is at (150,20).
    await page.waitForFunction(()=>{
      const image=document.querySelector('[data-testid="pet-park-garden-visible-art"]')?.getBoundingClientRect();
      const plot=document.querySelector('[data-testid="pet-park-garden-plot"]')?.getBoundingClientRect();
      if(!image||!plot)return false;
      const visibleX=image.left+image.width*(167.5/200);
      const visibleBottom=image.top+image.height*(70/200);
      return Math.abs(visibleX-(plot.left+plot.width/2+plot.width*.12))<5 &&
        Math.abs(visibleBottom-(plot.top+plot.height/2-plot.width*.05))<5 &&
        Math.abs(image.width/plot.width-.35)<.02;
    },null,{timeout:12000});
    const progress=page.getByTestId("pet-park-garden-growth-progress");
    assert.equal(await progress.count(),0,name+": all plant progress bars are hidden while idle");
    await apply("Water","planted"); // first pour fills 10 of 15
    assert.equal(inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft,90);
    await apply("Water","seedling"); // only 5 remaining for this stage
    await apply("Water","partial"); // only 7 for seedling
    await apply("Water","partial"); // 10 of 12
    await apply("Water","grown"); // only 2 to complete
    await apply("Water","grown"); // only 5, now harvest ready
    assert.equal(inventory.find(x=>x.inventoryId==="pail").gardenWaterLeft,61);
    await apply("Harvest","picked");
    await menu.getByTestId("pet-park-garden-harvest").waitFor({state:"visible"});
    assert.match(await menu.getByTestId("pet-park-garden-harvest").innerText(),/2 × Forest Tomato/);
    assert.equal(inventory.find(x=>x.inventoryId==="fruit").quantity,2);
    assert.equal(requests.length,9);
    await menu.getByRole("button",{name:"Close harvest notice"}).click();
    await dismiss();
    await ground.click();
    await menu.getByRole("button",{name:"Harvest",exact:true}).waitFor({state:"visible"});
    assert.equal(await menu.getByTestId("pet-park-garden-stage").count(),0);
    await dismiss();

    // A new player with no gardening equipment should see a small message,
    // rather than an empty blocking inventory popup or a usable action.
    plot.phase="empty"; plot.cropId=null; plot.waterApplied=0; plot.harvestReady=false; plot.pickedUntil=null;
    inventory=[];
    await page.reload({waitUntil:"commit"});
    await ground.waitFor({state:"visible"});
    await ground.click();
    await menu.getByTestId("pet-park-garden-no-items")
      .getByText("Come back when you have your gardening tools.",{exact:true}).waitFor();
    for(const label of ["Hoe","Plant","Water","Harvest"])
      assert.equal(await menu.getByRole("button",{name:label,exact:true}).isDisabled(),true,
        name+": empty Bag disables "+label);
    await dismiss();

    // Empty Watering Pail retains its actual 0/100 server value and directs
    // players to a Water Source without attempting to debit a nonexistent drop.
    plot.phase="planted"; plot.cropId=crop.id; plot.waterApplied=0;
    inventory=[{inventoryId:"hoe",shopItemId:"hoe-item",name:"Hoe",type:"garden_tool",
      specialType:"hoe",quantity:1,isListed:false,imageUrl:art},
      {inventoryId:"pail",shopItemId:"pail-item",name:"Watering Pail",type:"garden_tool",
      specialType:"watering_pail",quantity:1,isListed:false,isRefillable:true,gardenWaterLeft:0,imageUrl:art}];
    await page.reload({waitUntil:"commit"});
    await ground.waitFor({state:"visible"});
    await ground.click();
    await menu.getByTestId("pet-park-garden-no-items")
      .getByText("Find a Water Source to refill your pail.",{exact:true}).waitFor();
    assert.equal(await menu.getByRole("button",{name:"Water",exact:true}).isDisabled(),true);
    assert.equal(requests.length,9,name+": no tools/empty pail never generate garden mutations");
    await dismiss();

    // Multiple owned Seed Packs offer compact seed bubbles, not a second
    // "Use" confirmation. Listed marketplace seeds remain excluded.
    plot.phase="tilled"; plot.cropId=null; plot.waterApplied=0;
    inventory=[{inventoryId:"hoe",shopItemId:"hoe-item",name:"Hoe",type:"garden_tool",
      specialType:"hoe",quantity:1,isListed:false,imageUrl:art},
      {inventoryId:"seed",shopItemId:"seed-item",name:"Forest Tomato Seeds",type:"garden_seed",
      quantity:1,isListed:false,imageUrl:art},
      {inventoryId:"seed-b",shopItemId:"seed-item",name:"More Tomato Seeds",type:"garden_seed",
      quantity:1,isListed:false,imageUrl:art},
      {inventoryId:"seed-listed",shopItemId:"seed-item",name:"Market Seeds",type:"garden_seed",
      quantity:9,isListed:true,imageUrl:art}];
    await page.reload({waitUntil:"commit"});
    await ground.waitFor({state:"visible"});
    await ground.click();
    await menu.getByRole("button",{name:"Plant",exact:true}).click();
    const seedPicker=menu.getByTestId("pet-park-garden-seed-choices");
    await seedPicker.waitFor({state:"visible"});
    assert.equal(await seedPicker.getByTestId("pet-park-garden-seed-choice").count(),2);
    assert.equal(await seedPicker.getByText("Market Seeds").count(),0);
    await seedPicker.getByRole("button",{name:"Plant Forest Tomato Seeds"}).click();
    await page.getByTestId("pet-park-garden-visible-art").waitFor({state:"visible"});
    assert.equal(plot.phase,"planted");
    assert.equal(requests.length,10,name+": one seed choice submits one plant request");
    await dismiss();

    // Third-slot transition was previously reported to crash mobile Safari.
    // The server must complete the purchase only once and the page must
    // survive its 2 → 3 scene update, re-entering the equip picker on tap.
    scene.unlockedSlots=2;
    await page.reload({waitUntil:"commit"});
    const third=page.getByTestId("pet-park-slot-3");
    await third.waitFor({state:"visible"});
    await third.click();
    const thirdDialog=page.getByRole("dialog",{name:"Park pet spot 3"});
    await thirdDialog.waitFor({state:"visible"});
    await thirdDialog.getByRole("button",{name:/Unlock .*5,000 coins/}).click();
    await thirdDialog.waitFor({state:"hidden",timeout:10000});
    assert.equal(slotUnlockCalls,1,name+": exactly one server-authorized third spot debit");
    await third.click();
    await thirdDialog.waitFor({state:"visible"});
    await thirdDialog.getByRole("group",{name:"Choose pet for spot 3"}).waitFor({state:"visible"});
    await thirdDialog.getByRole("button",{name:"Close pet spot"}).click();
    await page.reload({waitUntil:"commit"});
    await third.waitFor({state:"visible"});
    await third.click();
    await thirdDialog.getByRole("group",{name:"Choose pet for spot 3"}).waitFor({state:"visible"});
    await thirdDialog.getByRole("button",{name:"Close pet spot"}).click();
    assert.equal(slotUnlockCalls,1,name+": third spot persists after reload, without charging twice");
    assert.equal(await page.getByTestId("pet-park-contact-shadow").count(),0,
      name+": outdoor pets cast no artificial foot oval");
    // Player shop display is loaded only after entering an Is Shop building,
    // not on every camera move / ordinary scene query.
    scene.items=[];
    scene.buildings=[{id:"shop1",name:"Woodland Shop",imageUrl:art,interiorImageUrl:art,
      xPct:.5,yPct:.5,size:240,flipped:false,layer:0,maxPets:10,
      interiorEffects:[{id:"lamp",type:"warm_glow",x:.5,y:.4,size:18}],
      interiorDarkness:40,isShop:true,shopItemIds:["seed-item"]}];
    await page.reload({waitUntil:"commit"});
    const shopEntrance=page.getByRole("button",{name:"Enter Woodland Shop"});
    await shopEntrance.waitFor({state:"visible"});
    await shopEntrance.click();
    const merchandise=page.getByTestId("pet-park-shop-merchandise");
    await merchandise.waitFor({state:"visible"});
    assert.equal(await page.getByTestId("pet-park-interior-slots").count(),0,
      name+": shop interiors have no pet placement slots");
    const product=page.getByRole("button",{name:"Buy Forest Tomato Seeds"});
    await product.waitFor({state:"visible"});
    const dark=page.locator('[data-testid="pet-park-interior-room"] [data-testid="home-interior-darkness-layer"]');
    await dark.waitFor({state:"visible"});
    assert.equal(await dark.evaluate(node=>node.tagName.toLowerCase()),"svg",
      name+": room darkness uses the same light-shaped cutout as Pet Homes");
    assert.equal(await dark.locator("mask").count(),1,
      name+": transparent dark layer must leave a cutout around active lamps");
    assert.equal(await dark.locator("rect[mask]").count(),1);
    assert.equal(await dark.locator("rect[mask]").evaluate(node=>node.style.fillOpacity),"0.4",
      name+": building-specific darkness is correctly saved and rendered");
    const roomLayers=await page.locator('[data-testid="pet-park-interior-room"] [data-park-interior-artwork]').evaluate(artwork=>{
      const children=Array.from(artwork.children);
      return {dark:children.findIndex(node=>node.getAttribute("data-testid")==="home-interior-darkness-layer"),
        light:children.findIndex(node=>node.getAttribute("data-testid")==="home-interior-effect-lamp")};
    });
    assert.ok(roomLayers.dark>=0 && roomLayers.light>roomLayers.dark,
      name+": glowing effect overlays are above the translucent dark background");
    assert.equal(await page.getByTestId("pet-park-shop-add-item").count(),0,
      name+": visitors cannot curate stock");
    await product.click();
    const confirmation=page.getByTestId("pet-park-shop-purchase-dialog");
    await confirmation.waitFor({state:"visible"});
    await confirmation.getByText("125").waitFor();
    assert.equal(await confirmation.locator('img[src*="MainGameCoinImage"]').count(),1,
      name+": purchase modal uses the game's real coin art");
    await confirmation.getByRole("button",{name:"Close purchase details"}).click({position:{x:5,y:5}});
    await confirmation.waitFor({state:"hidden"});
    assert.equal(shopPurchases,0,name+": tap outside never places an order");
    await product.click();
    await page.getByTestId("pet-park-confirm-purchase").click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-purchase-dialog"]')===null);
    assert.equal(shopPurchases,1,name+": confirmed park purchase uses one existing-coin transaction");
    await page.getByRole("button",{name:"Exit building"}).click();
    assert.deepEqual(errors,[],name+": no client runtime errors");
    console.log("PASS "+name+": actual Garden Plot alpha-art centering, stage water bar, six batched pours, outside dismissal, harvest, and shared camera zoom");
    await context.close();
  }
}finally{await browser.close();await server.close();}
