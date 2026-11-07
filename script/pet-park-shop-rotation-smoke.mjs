import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Actual merchandise editor, real pointer actions and its normal room/HUD
// portals. Isolated API responses; never touches production coins or DB.
const moduleId = "/__shop-rotation-fixture.tsx";
const fixture = [
  'import React,{useState} from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider,useQuery} from "@tanstack/react-query";',
  'import {getQueryFn} from "@/lib/queryClient";',
  'import {TooltipProvider} from "@/components/ui/tooltip";',
  'import PetParkShopShelf from "@/components/PetParkShopShelf";',
  'import "@/index.css";',
  'const q=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});',
  'function Fixture(){const [picker,setPicker]=useState(false);',
  ' const {data:scene}=useQuery({queryKey:["/api/pet-park/scene"]});',
  ' const admin=!location.search.includes("visitor");',
  ' const building=scene?.buildings?.[0];',
  ' if(!building)return null;',
  ' return <div data-testid="shop-room-test" style={{position:"relative",width:"100%",height:"100%"}}>',
  '  {admin && <button data-testid="open-shop-picker" style={{position:"absolute",zIndex:20,left:4,top:4}} onClick={()=>setPicker(true)}>Open picker</button>}',
  '  <PetParkShopShelf buildingId={building.id} itemIds={building.shopItemIds} placements={building.shopItemPlacements}',
  '   canEditPark={admin} imageWidth={window.innerWidth} imageHeight={window.innerHeight}',
  '   showPicker={picker} onShowPickerChange={setPicker}/></div>;',
  '}',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={q}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);',
].join("\n");
const server = await createServer({server:{host:"127.0.0.1",port:4192,strictPort:true},plugins:[{
  name:"pet-park-shop-rotation-fixture",
  resolveId:id=>id===moduleId?id:null,
  load:id=>id===moduleId?fixture:null,
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html"))return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
      '<div id="game-stage" data-coordinate-owner="viewport" style="position:fixed;inset:0">'+
      '<div id="root" style="position:absolute;inset:0"></div>'+
      '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div>'+
      '</div><script type="module" src="'+moduleId+'"></script></body></html>'));
  });},
}]});
const art="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><path d="M35 180 L100 30 L162 40 L52 185 Z" fill="#a2bb72"/></svg>',
).toString("base64");
await server.listen();
const browser=await chromium.launch({headless:true});
try {
  for(const [label,width,height] of [["phone",390,844],["tablet",834,1194]]) {
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page=await ctx.newPage();
    page.setDefaultTimeout(14000);
    const errors=[],writes=[];
    let layout=[{itemId:"scythe",xPct:.5,yPct:.4,size:12}]; // historic shop without rotation
    const item={id:"scythe",name:"Scythe",type:"garden_tool",specialType:"scythe",price:250,
      imageUrl:art,eggImageUrl:null,hatchedImageUrl:null,description:"Harvest crops"};
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/api/**",async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==="/api/pet-park/scene")return route.fulfill({json:{buildings:[{
        id:"shop1",isShop:true,shopItemIds:["scythe"],shopItemPlacements:layout,
      }]}});
      if(pathname==="/api/pet-park/buildings/shop1/shop-items")
        return route.fulfill({json:[item]});
      if(pathname==="/api/admin/pet-park/shop-catalog")
        return route.fulfill({json:[item]});
      if(pathname==="/api/inventory")return route.fulfill({json:[]});
      if(pathname==="/api/auth/me")return route.fulfill({json:{coins:5000}});
      if(pathname==="/api/admin/pet-park/buildings/shop1" && route.request().method()==="PATCH"){
        const body=route.request().postDataJSON();
        assert.deepEqual(body.shopItemIds,["scythe"]);
        assert.equal(body.shopItemPlacements.length,1);
        layout=body.shopItemPlacements;
        writes.push(structuredClone(layout[0]));
        return route.fulfill({json:{shopItemIds:["scythe"],shopItemPlacements:layout}});
      }
      return route.fulfill({json:{}});
    });
    await page.goto("http://127.0.0.1:4192/fixture?role=admin",{waitUntil:"domcontentloaded"});
    const artButton=page.getByTestId("pet-park-shop-item-scythe");
    await artButton.waitFor({state:"visible"});
    assert.equal(await artButton.getAttribute("aria-label"),"Place Scythe");
    assert.equal(await page.getByTestId("pet-park-shop-merchandise").getByText("Scythe").count(),0,
      label+": no floating labels on the artwork");
    const image=artButton.getByTestId("pet-park-shop-artwork");
    assert.equal(await image.evaluate(el=>el.style.transform),"rotate(0deg)",
      label+": old layouts render without rotation");
    await artButton.click();
    const preview=page.getByTestId("pet-park-shop-price-preview");
    await preview.waitFor({state:"visible"});
    assert.equal(await preview.getByTestId("pet-park-shop-price-tag").getByText("250").count(),1,
      label+": admin previews the actual item price");
    assert.equal(await artButton.getByTestId("pet-park-shop-price-tag").getByText("250").count(),1,
      label+": shop artwork has its own compact price sticker");
    const handle=preview.getByTestId("pet-park-shop-price-drag-handle");
    const tagBounds=await handle.boundingBox();
    const tagX=tagBounds.x+tagBounds.width/2,tagY=tagBounds.y+tagBounds.height/2;
    await page.mouse.move(tagX,tagY);
    await page.mouse.down();
    await page.mouse.move(tagX-24,tagY-20,{steps:6});
    await page.mouse.up();
    await page.waitForFunction(() => {
      const handle=document.querySelector('[data-testid="pet-park-shop-price-drag-handle"]');
      const sticker=document.querySelector('[data-testid="pet-park-shop-price-on-art"]');
      return handle && !handle.hasAttribute("disabled") && sticker && parseFloat(sticker.style.left)<70;
    });
    const tagPosition={x:layout[0].priceTagXPct,y:layout[0].priceTagYPct};
    assert.ok(tagPosition.x<.72 && tagPosition.y<.78,label+": drag stores an image-local tag position");
    assert.deepEqual({xPct:layout[0].xPct,yPct:layout[0].yPct,size:layout[0].size},
      {xPct:.5,yPct:.4,size:12},label+": moving a tag does not move the merchandise");
    const rotate=page.getByTestId("pet-park-shop-rotate");
    await rotate.waitFor({state:"visible"});
    await rotate.click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-artwork"]')?.style.transform==="rotate(15deg)");
    assert.equal(layout[0].rotation,15,label+": rotating persists through the normal building PATCH");
    assert.deepEqual({xPct:layout[0].xPct,yPct:layout[0].yPct,size:layout[0].size},
      {xPct:.5,yPct:.4,size:12},label+": orientation does not move or resize merchandise");
    await rotate.click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-artwork"]')?.style.transform==="rotate(30deg)");
    assert.equal(layout[0].rotation,30,label+": rotation advances by 15 degrees each tap");
    assert.equal(layout[0].priceTagXPct,tagPosition.x,label+": rotation does not reset the price tag X");
    assert.equal(layout[0].priceTagYPct,tagPosition.y,label+": rotation does not reset the price tag Y");
    // React applies the new angle optimistically, before PATCH completes.
    // Dragging is intentionally disabled during saves: wait for server
    // confirmation rather than racing the toolbar on slower tablets.
    await page.waitForFunction(() => {
      const rotateButton = document.querySelector('[data-testid="pet-park-shop-rotate"]');
      return rotateButton && !rotateButton.disabled;
    });
    // Admin editor remains capable of moving a rotated item with the same
    // touch pointer math and retaining its orientation.
    const bounds=await artButton.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+30,bounds.y+bounds.height/2+22,{steps:5});
    await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-item-scythe"]')?.style.left !== (window.innerWidth*.5)+"px");
    assert.equal(layout[0].rotation,30,label+": drag retains stored rotation");
    assert.equal(layout[0].priceTagXPct,tagPosition.x,label+": merchandise drag keeps tag X");
    assert.equal(layout[0].priceTagYPct,tagPosition.y,label+": merchandise drag keeps tag Y");
    await page.reload({waitUntil:"domcontentloaded"});
    await image.waitFor({state:"visible"});
    assert.equal(await image.evaluate(el=>el.style.transform),"rotate(30deg)",label+": saved rotation survives reload");
    assert.ok(Math.abs(parseFloat(await page.getByTestId("pet-park-shop-price-on-art").evaluate(el=>el.style.left))/100-tagPosition.x)<.001,
      label+": saved tag placement survives reload");
    assert.equal(await page.getByTestId("pet-park-shop-merchandise").getByText("Scythe").count(),0);
    await page.getByTestId("open-shop-picker").click();
    await page.getByTestId("pet-park-shop-picker").getByText("Scythe").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("pet-park-shop-picker").getByRole("option",{name:/Scythe/}).count(),1,
      label+": picker keeps item names");
    await page.getByRole("button",{name:"Close shop item picker"}).click();
    await page.goto("http://127.0.0.1:4192/fixture?role=visitor",{waitUntil:"domcontentloaded"});
    const buyButton=page.getByRole("button",{name:"Buy Scythe"});
    await buyButton.waitFor({state:"visible"});
    assert.equal(await buyButton.getByTestId("pet-park-shop-artwork").evaluate(el=>el.style.transform),"rotate(30deg)",
      label+": players see the stored orientation");
    assert.equal(await page.getByTestId("pet-park-shop-merchandise").getByText("Scythe").count(),0,
      label+": visitors never see floating labels");
    assert.equal(await buyButton.getByTestId("pet-park-shop-price-tag").getByText("250").count(),1,
      label+": visitors see the price on the item");
    assert.ok(Math.abs(parseFloat(await page.getByTestId("pet-park-shop-price-on-art").evaluate(el=>el.style.top))/100-tagPosition.y)<.001,
      label+": visitors see the saved tag position");
    await buyButton.click();
    await page.getByRole("dialog",{name:"Buy Scythe"}).getByRole("heading",{name:"Scythe"}).waitFor();
    assert.ok(writes.length>=4,label+": sticker placement, rotation and drag reuse the existing save route");
    assert.deepEqual(errors,[],label+": no client errors");
    console.log("PASS "+label+": rotate and drag persist, editable price sticker appears on merch and survives reload, no name labels, checkout remains readable");
    await ctx.close();
  }
} finally { await browser.close(); await server.close(); }
