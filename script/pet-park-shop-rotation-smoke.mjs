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
    const errors=[],writes=[],purchases=[];
    let coins=5000;
    let layout=[{itemId:"scythe",xPct:.5,yPct:.4,size:12}]; // historic shop without rotation
    let item={id:"scythe",name:"Scythe",type:"garden_tool",specialType:"scythe",price:250,
      imageUrl:art,eggImageUrl:null,hatchedImageUrl:null,description:"Harvest crops"};
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/api/**",async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==="/api/pet-park/scene")return route.fulfill({json:{buildings:[{
        id:"shop1",isShop:true,shopItemIds:[item.id],shopItemPlacements:layout,
      }]}});
      if(pathname==="/api/pet-park/buildings/shop1/shop-items")
        return route.fulfill({json:[item]});
      if(pathname==="/api/admin/pet-park/shop-catalog")
        return route.fulfill({json:[item]});
      if(pathname==="/api/inventory")return route.fulfill({json:[]});
      if(pathname==="/api/auth/me")return route.fulfill({json:{coins}});
      if(pathname==="/api/shop/pet-park/buy/"+item.id && route.request().method()==="POST"){
        const body=route.request().postDataJSON();
        purchases.push(body);
        assert.equal(body.buildingId,"shop1",label+": purchase keeps the verified building");
        assert.ok(Number.isSafeInteger(body.quantity) && body.quantity>=1 && body.quantity<=20);
        const total=item.price*body.quantity;
        assert.ok(total<=coins,label+": no purchase can overspend");
        coins-=total;
        return route.fulfill({json:{user:{coins},quantity:body.quantity}});
      }
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
    assert.equal(await image.evaluate(el=>el.style.transform),"rotate(0deg) scaleX(1)",
      label+": old layouts render without rotation");
    await artButton.click();
    const preview=page.getByTestId("pet-park-shop-price-preview");
    await preview.waitFor({state:"visible"});
    assert.equal(await preview.getByText("250").count(),0,
      label+": admin tag preview has no numeric price");
    assert.equal(await artButton.getByText("250").count(),0,
      label+": scene merchandise shows no numeric price");
    const sceneTag=artButton.getByTestId("pet-park-shop-price-tag");
    assert.ok((await sceneTag.getByTestId("pet-park-shop-tag-art").getAttribute("src")).includes("price_tag.png"),
      label+": existing wooden tag artwork is rendered on merchandise");
    assert.equal(await sceneTag.getByTestId("pet-park-shop-tag-coin").count(),1,
      label+": centered coin marks merchandise as buyable");
    const tagSize=await sceneTag.evaluate(el=>el.getBoundingClientRect().width);
    const itemSize=await artButton.evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(tagSize>0 && tagSize<itemSize*.6,
      label+": coin tag is small and scales relative to the item artwork");
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
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-artwork"]')?.style.transform==="rotate(15deg) scaleX(1)");
    assert.equal(layout[0].rotation,15,label+": rotating persists through the normal building PATCH");
    assert.deepEqual({xPct:layout[0].xPct,yPct:layout[0].yPct,size:layout[0].size},
      {xPct:.5,yPct:.4,size:12},label+": orientation does not move or resize merchandise");
    await rotate.click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-artwork"]')?.style.transform==="rotate(30deg) scaleX(1)");
    assert.equal(layout[0].rotation,30,label+": rotation advances by 15 degrees each tap");
    assert.equal(layout[0].priceTagXPct,tagPosition.x,label+": rotation does not reset the price tag X");
    assert.equal(layout[0].priceTagYPct,tagPosition.y,label+": rotation does not reset the price tag Y");
    const flip=page.getByTestId("pet-park-shop-flip");
    await page.waitForFunction(() => {
      const button=document.querySelector('[data-testid="pet-park-shop-flip"]');
      return button && !button.disabled;
    });
    await flip.click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-artwork"]')?.style.transform==="rotate(30deg) scaleX(-1)");
    assert.equal(layout[0].flippedX,true,label+": mirror state is saved with existing item placement");
    assert.equal(await flip.getAttribute("aria-pressed"),"true",label+": flip button indicates its state");
    assert.equal(await preview.getByTestId("pet-park-shop-price-preview-art").locator("img").first()
      .evaluate(el=>el.style.transform),"rotate(30deg) scaleX(-1)",
      label+": preview mirrors artwork too");
    assert.equal(layout[0].priceTagXPct,tagPosition.x,label+": flipping keeps tag X");
    assert.equal(layout[0].priceTagYPct,tagPosition.y,label+": flipping keeps tag Y");
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
    await preview.waitFor({state:"hidden"});
    await page.mouse.up();
    await preview.waitFor({state:"visible"});
    await page.waitForFunction(()=>document.querySelector('[data-testid="pet-park-shop-item-scythe"]')?.style.left !== (window.innerWidth*.5)+"px");
    assert.equal(layout[0].rotation,30,label+": drag retains stored rotation");
    assert.equal(layout[0].flippedX,true,label+": drag retains stored flip");
    assert.equal(layout[0].priceTagXPct,tagPosition.x,label+": merchandise drag keeps tag X");
    assert.equal(layout[0].priceTagYPct,tagPosition.y,label+": merchandise drag keeps tag Y");
    await page.reload({waitUntil:"domcontentloaded"});
    await image.waitFor({state:"visible"});
    assert.equal(await image.evaluate(el=>el.style.transform),"rotate(30deg) scaleX(-1)",label+": saved rotation and flip survive reload");
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
    assert.equal(await buyButton.getByTestId("pet-park-shop-artwork").evaluate(el=>el.style.transform),"rotate(30deg) scaleX(-1)",
      label+": players see the stored rotation and flip");
    assert.equal(await page.getByTestId("pet-park-shop-merchandise").getByText("Scythe").count(),0,
      label+": visitors never see floating labels");
    assert.equal(await buyButton.getByText("250").count(),0,
      label+": visitors see the wooden tag and coin without an on-art price");
    assert.equal(await buyButton.getByTestId("pet-park-shop-tag-coin").count(),1,
      label+": visitors can identify purchasable items by the coin");
    assert.ok((await buyButton.getByTestId("pet-park-shop-tag-art").getAttribute("src")).includes("price_tag.png"));
    assert.ok(Math.abs(parseFloat(await page.getByTestId("pet-park-shop-price-on-art").evaluate(el=>el.style.top))/100-tagPosition.y)<.001,
      label+": visitors see the saved tag position");
    await buyButton.click();
    const purchaseDialog=page.getByRole("dialog",{name:"Buy Scythe"});
    await purchaseDialog.getByRole("heading",{name:"Scythe"}).waitFor();
    await purchaseDialog.getByText("250",{exact:true}).waitFor({state:"visible"});
    assert.equal(await purchaseDialog.getByTestId("pet-park-shop-quantity-plus").count(),0,
      label+": one-per-kind gardening tools cannot be bulk ordered");
    assert.equal(await purchaseDialog.getByText("One per player").count(),1);
    assert.ok(writes.length>=5,label+": tag placement, rotation, flip and drag reuse the existing save route");

    // Switch the mocked inventory to ordinary garden seeds. Exercise the
    // real checkout with touch-sized controls on both phone and tablet.
    item={...item,id:"seed",name:"Blueberry Seeds",type:"garden_seed",specialType:null,price:10};
    layout=[{itemId:"seed",xPct:.5,yPct:.4,size:12}];
    coins=35;
    await page.reload({waitUntil:"domcontentloaded"});
    const seedButton=page.getByRole("button",{name:"Buy Blueberry Seeds"});
    await seedButton.waitFor({state:"visible"});
    await seedButton.click();
    const seedDialog=page.getByRole("dialog",{name:"Buy Blueberry Seeds"});
    await seedDialog.waitFor({state:"visible"});
    const minus=seedDialog.getByTestId("pet-park-shop-quantity-minus");
    const plus=seedDialog.getByTestId("pet-park-shop-quantity-plus");
    const quantity=seedDialog.getByTestId("pet-park-shop-quantity-value");
    const total=seedDialog.getByTestId("pet-park-shop-total-price");
    const checkout=seedDialog.getByTestId("pet-park-confirm-purchase");
    assert.equal(await quantity.innerText(),"1",label+": quantity starts at one");
    assert.equal(await minus.isDisabled(),true,label+": cannot decrement below one");
    assert.equal(await total.innerText(),"10",label+": starts at unit price");
    await plus.click();
    await plus.click();
    await plus.click();
    assert.equal(await quantity.innerText(),"4",label+": plus updates quantity");
    assert.equal(await total.innerText(),"40",label+": total updates with quantity");
    assert.equal(await checkout.isDisabled(),true,label+": bulk total cannot exceed available coins");
    assert.ok((await checkout.innerText()).includes("Not enough coins"));
    await minus.click();
    assert.equal(await quantity.innerText(),"3",label+": minus updates quantity");
    assert.equal(await total.innerText(),"30",label+": total recalculates after decrement");
    assert.equal(await checkout.isEnabled(),true,label+": affordable quantity can be purchased");
    assert.ok((await checkout.innerText()).includes("3 items"));
    await checkout.click();
    await page.getByTestId("pet-park-shop-purchase-confirmation").waitFor({state:"visible"});
    assert.deepEqual(purchases,[{buildingId:"shop1",quantity:3}],
      label+": one atomic checkout submits the exact requested quantity");
    assert.equal(coins,5,label+": server-calculated total is deducted only once");
    assert.equal(await page.getByText("Purchase complete").count(),0,
      label+": generic purchase-complete toast is gone");
    assert.ok((await page.getByTestId("pet-park-shop-purchase-confirmation").innerText()).includes("3 × Blueberry Seeds"));
    await seedButton.click();
    await seedDialog.waitFor({state:"visible"});
    assert.equal(await quantity.innerText(),"1",label+": next purchase resets quantity");
    assert.deepEqual(errors,[],label+": no client errors");
    console.log("PASS "+label+": shop art, quiet purchase confirmation, quantity +/- and atomic multi-seed checkout");
    await ctx.close();
  }
} finally { await browser.close(); await server.close(); }
