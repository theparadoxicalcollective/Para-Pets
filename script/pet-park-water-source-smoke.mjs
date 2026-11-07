import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real PetParkPage with isolated scene/inventory responses. No production
// records or rewards are ever changed by these phone/tablet touch checks.
const moduleId = "/__park-water-source-fixture.tsx";
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
const server = await createServer({server:{host:"127.0.0.1",port:4187,strictPort:true},plugins:[{
  name:"water-source-fixture",
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
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="30" y="30" width="140" height="140" rx="25" fill="#5a9d91"/></svg>',
).toString("base64");
const altArt="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="30" y="30" width="140" height="140" rx="25" fill="#d0a763"/></svg>',
).toString("base64");
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[],requests=[];
    page.on("pageerror",error=>errors.push(error.message));
    const scene={
      enabledForPlayers:true,canEnterPark:true,canEditPark:false,groundLevel:1,
      backgroundUrl:null,groundTheme:"grass",buildings:[],deposits:[],sharedPets:[],unlockedSlots:1,
      items:[
        {id:"fountain",kind:"decor",effectType:null,isWaterSource:true,imageUrl:art,tapImageUrl:altArt,xPct:.5,yPct:.5,size:140,flipped:false,layer:0},
        {id:"gate",kind:"decor",effectType:null,isWaterSource:false,imageUrl:art,tapImageUrl:altArt,
          xPct:.42,yPct:.43,size:105,flipped:false,layer:0},
        {id:"ordinary-decor",kind:"decor",effectType:null,isWaterSource:false,imageUrl:art,xPct:.7,yPct:.65,size:100,flipped:false,layer:0},
      ],
    };
    let inventory=[
      {inventoryId:"pail",shopItemId:"pail-item",name:"Forest Pail",imageUrl:art,
        type:"garden_tool",specialType:"watering_pail",isRefillable:true,gardenWaterLeft:12,isListed:false,quantity:1},
      {inventoryId:"full",shopItemId:"full-item",name:"Full Container",imageUrl:art,
        type:"garden_tool",specialType:"watering_pail",isRefillable:true,gardenWaterLeft:100,isListed:false,quantity:1},
      {inventoryId:"forbidden",shopItemId:"ordinary-item",name:"Ordinary Decor",imageUrl:art,
        type:"garden_tool",specialType:"watering_pail",isRefillable:false,gardenWaterLeft:0,isListed:false,quantity:1},
      {inventoryId:"listed",shopItemId:"listed-item",name:"Market Pail",imageUrl:art,
        type:"garden_tool",specialType:"watering_pail",isRefillable:true,gardenWaterLeft:0,isListed:true,quantity:1},
    ];
    await page.route("**/api/**",route=>{
      const url=new URL(route.request().url());
      if(url.pathname==="/api/pet-park/scene")return route.fulfill({json:scene});
      if(url.pathname==="/api/pet-park/status")return route.fulfill({json:{enabledForPlayers:true,canEnterPark:true}});
      if(url.pathname==="/api/inventory")return route.fulfill({json:inventory});
      if(url.pathname==="/api/pet-park/water-sources/fountain/refill"){
        const body=route.request().postDataJSON();
        requests.push(body);
        if(body.inventoryId!=="pail")return route.fulfill({status:422,json:{message:"Not refillable"}});
        inventory=inventory.map(item=>item.inventoryId==="pail"?{...item,gardenWaterLeft:100}:item);
        return route.fulfill({json:{inventoryId:"pail",itemName:"Forest Pail",waterLeft:100,capacity:100}});
      }
      return route.fulfill({json:{}});
    });
    await page.goto("http://127.0.0.1:4187/fixture",{waitUntil:"commit",timeout:30000});
    // Real touch interaction on an ordinary tappable gate, including
    // alpha-transparent hit areas, repeat tap, and accessible keyboard click.
    const gate=page.getByTestId("pet-park-tappable-decor");
    await gate.waitFor({state:"visible",timeout:30000});
    assert.equal(await gate.count(),1,name+": only decor with alternate art is independently tappable");
    const gateImage=gate.locator("..").locator("img");
    await gateImage.evaluate(img=>img.decode());
    assert.equal(await gateImage.getAttribute("src"),art);
    // Pointer events now pass through clipped transparent pixels; clicking
    // Playwright's button at (3,3) waits forever because it is correctly
    // outside the browser's hit-tested shape. Click scene coordinates instead.
    const gateRect=await gate.boundingBox();
    assert.ok(gateRect,name+": tappable decor has a visible image region");
    await page.mouse.click(gateRect.x+3,gateRect.y+3);
    assert.equal(await gateImage.getAttribute("src"),art,name+": transparent area passes through without toggling");
    await gate.click();
    assert.equal(await gateImage.getAttribute("src"),altArt,name+": first tap shows alternate image");
    await gateImage.evaluate(img=>img.decode());
    await gate.click();
    assert.equal(await gateImage.getAttribute("src"),art,name+": second tap restores original");
    await gate.focus();
    await page.keyboard.press("Enter");
    assert.equal(await gateImage.getAttribute("src"),altArt,name+": keyboard click is accessible");

    const water=page.getByTestId("pet-park-water-source");
    await water.waitFor({state:"visible",timeout:30000});
    assert.equal(await water.count(),1,name+": only marked decor is interactive");
    await water.evaluate(button=>button.parentElement.querySelector("img").decode());
    const waterRect=await water.boundingBox();
    assert.ok(waterRect,name+": water source has a visible image region");
    await page.mouse.click(waterRect.x+3,waterRect.y+3);
    assert.equal(await page.getByTestId("pet-park-refill-popup").count(),0,name+": transparent art passes through without refill");
    await water.click();
    assert.equal(await water.locator("..").locator("img").getAttribute("src"),altArt,
      name+": a water-source decor can switch artwork without losing refill behavior");
    const dialog=page.getByRole("dialog",{name:"Refill Water"});
    await dialog.waitFor({state:"visible"});
    await dialog.getByTestId("pet-park-refill-item").waitFor({state:"visible"});
    assert.equal(await dialog.getByTestId("pet-park-refill-item").count(),1,
      name+": only partial, owned, unlisted, refillable equipment is offered");
    assert.match(await dialog.innerText(),/Forest Pail/);
    assert.match(await dialog.innerText(),/12 \/ 100 drops/);
    const response=page.waitForResponse(r=>r.url().includes("/api/pet-park/water-sources/fountain/refill"));
    await dialog.getByTestId("pet-park-refill-item").click();
    await response;
    await dialog.waitFor({state:"hidden"});
    assert.deepEqual(requests,[{inventoryId:"pail"}],name+": only actual owned inventory ID is sent");
    await water.click();
    await dialog.waitFor({state:"visible"});
    await dialog.getByText(/no refillable items that need water/i).waitFor({state:"visible"});
    assert.equal(await dialog.getByTestId("pet-park-refill-item").count(),0,
      name+": full water containers are not refilled again");
    await page.getByRole("button",{name:"Close refill popup"}).click();
    assert.deepEqual(errors,[],name+": no client runtime errors");
    console.log("PASS "+name+": alpha-aware water-source tap, actual inventory filter, one refill and updated full pail");
    await context.close();
  }
}finally{await browser.close();await server.close();}
