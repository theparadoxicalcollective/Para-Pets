import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated browser fixture: the actual PetInventory UI and account-safe
// requests, but no production Railway database or player accounts.
const fixtureId="/__pet-inventory-showcase-fixture.tsx";
const fixture=[
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClientProvider} from "@tanstack/react-query";',
  'import {queryClient} from "@/lib/queryClient";',
  'import {TooltipProvider} from "@/components/ui/tooltip";',
  'import PetInventory from "@/components/PetInventory";',
  'import "@/index.css";',
  'queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});',
  'const user={id:"pet-spotlight-fixture",username:"Grove Keeper",coins:1500,activePetId:"pet-a",isAdmin:false};',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}><TooltipProvider>',
  '<PetInventory user={user} onClose={()=>{}} onUserUpdate={()=>{}} defaultTab={window.location.pathname === "/bag" ? "bag" : "pets"} pageMode />',
  '</TooltipProvider></QueryClientProvider>);',
].join("\n");

const server=await createServer({
  server:{host:"127.0.0.1",port:4215,strictPort:true},
  plugins:[{
    name:"isolated-pet-inventory-showcase",
    resolveId:id=>id===fixtureId?id:null,
    load:id=>id===fixtureId?fixture:null,
    configureServer(vite){
      vite.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes("text/html"))return next();
        res.setHeader("Content-Type","text/html");
        res.end(await vite.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+
          '<div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0;overflow:hidden">'+
          '<div id="game-viewport-backdrop" style="position:absolute;inset:0;z-index:1;pointer-events:none"></div>'+
          '<div id="root" style="position:absolute;inset:0;z-index:20"></div>'+
          '<div id="game-viewport-hud" style="position:absolute;inset:0;z-index:40;pointer-events:none"></div>'+
          '</div><script type="module" src="'+fixtureId+'"></script></body></html>'));
      });
    },
  }],
});

const art="data:image/svg+xml;base64,"+Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><path d="M80 6 C128 8 140 75 135 101 Q115 150 80 153 Q40 147 20 99 Q20 26 80 6" fill="#9ccf85" stroke="#d9ba63" stroke-width="5"/><circle cx="63" cy="75" r="7" fill="#173824"/><circle cx="102" cy="75" r="7" fill="#173824"/></svg>'
).toString("base64");

function ownedPet(inventoryId,name,rarity,isHatched,level=1){
  return {inventoryId,id:inventoryId,shopItemId:inventoryId,name,type:"pet",
    imageUrl:art,eggImageUrl:art,hatchedImageUrl:art,petTemplateId:null,
    isHatched,isListed:false,isEvolved:false,petNickname:null,rarity,
    petLevel:level,petLevelPoints:0,petHealth:1000,petAtk:55,petDef:45,
    hatchStartedAt:null,hatchTime:1,quantity:1,itemsUsedThisLevel:0,
    fishingType:null,specialSkill:null,skillType:null,skillAffects:null};
}
const pets=[
  ownedPet("pet-a","Forest Cow",4,true,5),
  ownedPet("pet-b","Moss Deer",4,true,7),
  ownedPet("pet-c","Small Mummy",1,true,1),
  ...Array.from({length:9},(_,i)=>ownedPet(`pet-extra-${i}`,`Companion ${i+1}`,1,true,2)),
  {...ownedPet("egg-ready","Dawn Egg",2,false),hatchStartedAt:"2020-01-01T00:00:00.000Z"},
  {...ownedPet("egg-wait","Moon Egg",5,false),hatchStartedAt:new Date(Date.now()).toISOString()},
];
const bagItem=(type,id,name,rarity=null)=>({
  ...ownedPet(id,name,rarity,false,1),type,quantity:1,
  starRarity:rarity,
});
const bagItems=[
  bagItem("mini_pet","mini-c","Blue Sprite",3),
  bagItem("mini_pet","mini-z","Zebra Spirit",5),
  bagItem("mini_pet","mini-a","Amber Spirit",5),
  bagItem("mini_pet","mini-b","Clover Pixie",1),
  bagItem("gift","gift-z","Zesty Gift"),
  bagItem("gift","gift-a","Apple Gift"),
  bagItem("gift","gift-m","Moon Gift"),
];
const allInventory=[...pets,...bagItems];

await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const sc of [
    {name:"small iPhone",width:320,height:568},
    {name:"iPhone",width:390,height:844},
    {name:"tablet",width:820,height:1180},
  ]){
    const ctx=await browser.newContext({
      viewport:{width:sc.width,height:sc.height},isMobile:true,hasTouch:true,
    });
    const page=await ctx.newPage(),errors=[],writes=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.setDefaultTimeout(25000);
    await page.route("**/api/**",route=>{
      const url=new URL(route.request().url());
      const method=route.request().method();
      if(url.pathname==="/api/inventory")return route.fulfill({json:allInventory});
      if(url.pathname==="/api/user/equipped-accessory-ids")return route.fulfill({json:[]});
      if(url.pathname==="/api/fishing/inventory")return route.fulfill({json:[]});
      if(method==="POST" && url.pathname==="/api/pet/egg-ready/hatch-check"){
        writes.push(url.pathname);
        return route.fulfill({json:{isHatched:true}});
      }
      return route.fulfill({json:[]});
    });
    await page.goto("http://127.0.0.1:4215/pets",{waitUntil:"domcontentloaded"});
    await page.getByTestId("inventory-featured-pet").waitFor({state:"visible"});
    assert.match(await page.getByTestId("text-featured-pet-name").innerText(),/Forest Cow/);
    const petsTab=page.getByTestId("inventory-tab-pets");
    const eggsTab=page.getByTestId("inventory-tab-eggs");
    assert.equal(await petsTab.getAttribute("aria-selected"),"true",
      sc.name+": Pets tab is the default with hatched pets");
    assert.equal(await eggsTab.getAttribute("aria-selected"),"false");
    assert.equal(await page.getByTestId("inventory-hatched-pets").locator('[data-testid^="card-pet-"]').count(),12,
      sc.name+": all twelve hatched companions remain reachable");
    const firstPetNames=await page.getByTestId("inventory-hatched-pets")
      .locator(".pet-collection__tile-name").allInnerTexts();
    assert.deepEqual(firstPetNames.slice(0,2),["Forest Cow","Moss Deer"],
      sc.name+": same 4-star pets sort alphabetically, not by level");
    assert.equal(await page.getByTestId("inventory-pet-eggs").count(),0,
      sc.name+": egg cards are separated into their own tab");
    assert.equal(await page.getByTestId("inventory-pets-eggs-divider").count(),1,
      sc.name+": divider is pinned under the pet overview");
    assert.equal(await page.getByText(/Companion Grove|Hatched Companions ·|Unhatched Eggs ·|Set Featured Companion|Your Selected Companion/).count(),0);
    assert.equal(await page.locator('[data-testid^="button-pet-menu-"]').count(),0,
      sc.name+": unnecessary Pet Menu opener is gone");
    const actionBar=page.getByTestId("inventory-pet-action-menu");
    await actionBar.waitFor({state:"visible"});
    assert.equal(await actionBar.locator('[data-pet-action]').count(),4,
      sc.name+": all four pet actions appear without another tap");
    assert.equal(await actionBar.getAttribute("data-pet-inventory-id"),"pet-a");
    const getLayout=()=>page.evaluate(()=>{
      const rect=selector=>{
        const e=document.querySelector(selector);
        if(!e)return null;
        const r=e.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};
      };
      const scroll=document.querySelector('[data-testid="inventory-pet-collection-scroll"]');
      const tiles=Array.from(document.querySelectorAll('.pet-collection__tile')).slice(0,3).map(e=>e.getBoundingClientRect().left);
      return {
        overview:rect('[data-testid="inventory-featured-pet"]'),
        divider:rect('[data-testid="inventory-pets-eggs-divider"]'),
        tabs:rect('.pet-collection__tabs'),
        scroll:rect('[data-testid="inventory-pet-collection-scroll"]'),
        firstTile:rect('.pet-collection__tile'), tiles,
        scrollWidth:scroll?.scrollWidth,clientWidth:scroll?.clientWidth,
        scrollHeight:scroll?.scrollHeight,clientHeight:scroll?.clientHeight,
        scrollTop:scroll?.scrollTop,
        scrollbar:getComputedStyle(scroll).scrollbarWidth,
        touchAction:getComputedStyle(scroll).touchAction,
      };
    });
    const layout=await getLayout();
    assert.ok(layout.overview.height<=255, sc.name+": selected overview remains compact "+JSON.stringify(layout));
    assert.ok(layout.firstTile.height<=155, sc.name+": pet cards remain compact");
    assert.ok(new Set(layout.tiles.map(Math.round)).size>=3,
      sc.name+": at least three pet columns at phone/tablet widths");
    assert.ok(layout.divider.top>=layout.overview.bottom-1 &&
      layout.tabs.top>=layout.divider.bottom &&
      layout.scroll.top>=layout.tabs.bottom-1,
      sc.name+": divider and tabs sit between fixed overview and list: "+JSON.stringify(layout));
    assert.equal(layout.scrollbar,"none",sc.name+": scrollbar is visually hidden");
    assert.equal(layout.touchAction,"pan-y",sc.name+": finger drag remains enabled");
    assert.ok(layout.scrollWidth<=layout.clientWidth+2,
      sc.name+": no horizontal scroll or clipping");
    if(sc.height<=844) assert.ok(layout.scrollHeight>layout.clientHeight,
      sc.name+": long phone collection scrolls within the list");
    if(layout.scrollHeight>layout.clientHeight){
      await page.evaluate(()=>{
        const el=document.querySelector('[data-testid="inventory-pet-collection-scroll"]');
        el.scrollTop=el.scrollHeight;
      });
      const moved=await getLayout();
      assert.ok(moved.scrollTop>0,sc.name+": pet collection scrollTop moves");
      assert.ok(Math.abs(moved.overview.top-layout.overview.top)<=2 &&
        Math.abs(moved.divider.top-layout.divider.top)<=2 &&
        Math.abs(moved.tabs.top-layout.tabs.top)<=2,
        sc.name+": pet details, divider and tabs remain pinned while scrolling: "+JSON.stringify(moved));
    }

    await page.getByRole("button",{name:"Select Moss Deer, level 7"}).click();
    assert.match(await page.getByTestId("text-featured-pet-name").innerText(),/Moss Deer/);
    assert.equal(await actionBar.getAttribute("data-pet-inventory-id"),"pet-b",
      sc.name+": visible action targets update to the selected inventory ID");
    assert.equal(await page.locator('[data-pet-action]').count(),4);
    const geometry=await page.evaluate(()=>{
      const hero=document.querySelector('[data-testid="inventory-featured-pet"]')?.getBoundingClientRect();
      const menu=document.querySelector('[data-testid="inventory-pet-action-menu"]')?.getBoundingClientRect();
      const items=Array.from(document.querySelectorAll('[data-pet-action]')).map(el=>{
        const r=el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
      });
      return {hero:{left:hero?.left,right:hero?.right,top:hero?.top,bottom:hero?.bottom},
        menu:{left:menu?.left,right:menu?.right,top:menu?.top,bottom:menu?.bottom},items};
    });
    assert.ok(geometry.menu.left>=geometry.hero.left-1 &&
      geometry.menu.right<=geometry.hero.right+1 &&
      geometry.menu.bottom<=geometry.hero.bottom+1,
      sc.name+": permanent action bar remains inside the fixed pet overview");
    for(let a=0;a<geometry.items.length;a++)for(let b=a+1;b<geometry.items.length;b++){
      const x=geometry.items[a],y=geometry.items[b];
      assert.ok(Math.min(x.right,y.right)-Math.max(x.left,y.left)<=0 ||
        Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)<=0,
        sc.name+": action buttons do not overlap");
    }
    await page.keyboard.press("Escape");
    assert.equal(await actionBar.locator('[data-pet-action]').count(),4,
      sc.name+": Escape does not dismiss the permanent tools");

    await page.getByRole("button",{name:"Select Companion 9, level 2"}).click();
    assert.match(await page.getByTestId("text-featured-pet-name").innerText(),/Companion 9/);
    const selectedTop=await page.getByTestId("inventory-featured-pet").evaluate(el=>el.getBoundingClientRect().top);
    assert.ok(Math.abs(selectedTop-layout.overview.top)<=2,
      sc.name+": selecting a distant pet keeps overview stationary");
    assert.equal(writes.length,0,sc.name+": browsing pets does not change the server's active pet");

    await eggsTab.click();
    assert.equal(await eggsTab.getAttribute("aria-selected"),"true",
      sc.name+": Eggs tab activates");
    assert.equal(await petsTab.getAttribute("aria-selected"),"false");
    assert.equal(await page.getByTestId("inventory-hatched-pets").count(),0,
      sc.name+": pet cards are hidden on Eggs");
    assert.equal(await page.getByTestId("inventory-pet-eggs").locator('[data-testid^="card-pet-"]').count(),2,
      sc.name+": two eggs remain accessible");
    assert.deepEqual(await page.getByTestId("inventory-pet-eggs")
      .locator(".pet-collection__egg-name").allInnerTexts(),["Moon Egg","Dawn Egg"],
      sc.name+": eggs sort highest-star rarity before name");
    assert.equal(await actionBar.locator('[data-pet-action]').count(),4,
      sc.name+": changing tabs never removes the selected pet actions");
    await page.getByTestId("card-pet-egg-wait").click();
    await page.getByTestId("button-close-inv-speedup").waitFor({state:"visible"});
    await page.getByTestId("button-close-inv-speedup").click();
    await page.getByTestId("card-pet-egg-ready").click();
    assert.deepEqual(writes,["/api/pet/egg-ready/hatch-check"],
      sc.name+": hatching and speed-up actions retain their original APIs");
    await page.getByText("HATCHED!").first().waitFor({state:"visible"});
    await petsTab.click();
    assert.equal(await petsTab.getAttribute("aria-selected"),"true");
    assert.equal(await page.getByTestId("inventory-hatched-pets").locator('[data-testid^="card-pet-"]').count(),12,
      sc.name+": returning to Pets restores collection");
    const style=await page.getByTestId("inventory-featured-pet").evaluate(el=>{
      const s=getComputedStyle(el);
      return {border:s.borderColor,background:s.backgroundImage};
    });
    assert.match(style.background,/gradient/,sc.name+": forest spotlight backdrop renders");
    await page.getByTestId("inventory-pet-action-care").click();
    await page.waitForFunction(() => window.location.pathname === "/pet-care/pet-extra-8");
    assert.equal(new URL(page.url()).searchParams.get("from"),"pets",
      sc.name+": visible Care action still routes by selected inventory ID and returns to Pets");
    // Open the same production inventory component in Bag mode. Exercise
    // category tabs as real touch targets; sorting must not change counts.
    await page.goto("http://127.0.0.1:4215/bag",{waitUntil:"domcontentloaded"});
    await page.getByTestId("bag-group-tabs").waitFor({state:"visible"});
    await page.getByTestId("button-bag-group-pets").tap();
    await page.getByTestId("button-bag-tab-mini_pets").tap();
    assert.deepEqual(await page.locator('[data-testid^="text-bag-item-name-"]').allInnerTexts(),
      ["Amber Spirit","Zebra Spirit","Blue Sprite","Clover Pixie"],
      sc.name+": Mini Pets sort highest rarity, then A–Z within that star group");
    await page.getByTestId("button-bag-group-items").tap();
    await page.getByTestId("button-bag-tab-gifts").tap();
    assert.deepEqual(await page.locator('[data-testid^="text-bag-item-name-"]').allInnerTexts(),
      ["Apple Gift","Moon Gift","Zesty Gift"],
      sc.name+": ordinary bag gifts are alphabetical in their selected tab");
    await page.getByTestId("button-bag-group-pets").tap();
    await page.getByTestId("button-bag-tab-pets").tap();
    const renderedPetNames=await page.getByTestId("bag-full-pets")
      .locator('button[aria-label^="View "]').evaluateAll(nodes =>
        nodes.slice(0,3).map(n=>n.getAttribute("aria-label")));
    // Bag's Pets category includes eggs AND hatched pets; the separate
    // collection tabs intentionally split those two sets.
    assert.deepEqual(renderedPetNames,
      ["View Moon Egg details","View Forest Cow details","View Moss Deer details"],
      sc.name+": Bag Pets keeps eggs and hatched pets in one rarity/name order");
    assert.equal(writes.length,1,
      sc.name+": switching inventory filters never changes saved inventory or pet state");
    assert.equal(errors.length,0,sc.name+": no browser page errors: "+errors.join("; "));
    await ctx.close();
  }
}finally{
  await browser.close();
  await server.close();
}
console.log("Compact pet inventory mobile/tablet browser smoke passed");
