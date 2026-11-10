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
  '<PetInventory user={user} onClose={()=>{}} onUserUpdate={()=>{}} defaultTab="pets" pageMode />',
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
  ownedPet("pet-a","Forest Cow",3,true,5),
  ownedPet("pet-b","Moss Deer",4,true,7),
  ownedPet("pet-c","Small Mummy",1,true,1),
  {...ownedPet("egg-ready","Dawn Egg",2,false),hatchStartedAt:"2020-01-01T00:00:00.000Z"},
  {...ownedPet("egg-wait","Moon Egg",5,false),hatchStartedAt:new Date(Date.now()).toISOString()},
];

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
      if(url.pathname==="/api/inventory")return route.fulfill({json:pets});
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
    assert.equal(await page.getByTestId("inventory-hatched-pets").locator('[data-testid^="card-pet-"]').count(),3,
      sc.name+": three hatched pet selectors");
    assert.equal(await page.getByTestId("inventory-pet-eggs").locator('[data-testid^="card-pet-"]').count(),2,
      sc.name+": two eggs remain separate");
    assert.equal(await page.getByTestId("inventory-pets-eggs-divider").count(),1,
      sc.name+": divider between hatched and eggs");

    const selected=page.getByRole("button",{name:"Select Moss Deer, level 7"});
    await selected.click();
    assert.equal(await selected.getAttribute("aria-pressed"),"true");
    assert.match(await page.getByTestId("text-featured-pet-name").innerText(),/Moss Deer/);
    const trigger=page.getByTestId("button-pet-menu-pet-b");
    await trigger.click();
    await page.getByTestId("inventory-pet-action-menu").waitFor({state:"visible"});
    assert.equal(await page.locator('[data-pet-action]').count(),4,
      sc.name+": care, level-up, power-up and closet all remain");
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
      sc.name+": menu remains anchored inside selected pet's panel");
    for(let i=0;i<geometry.items.length;i++)for(let j=i+1;j<geometry.items.length;j++){
      const a=geometry.items[i],b=geometry.items[j];
      const overlappingX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
      const overlappingY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      assert.ok(overlappingX<=0||overlappingY<=0,sc.name+": action targets do not overlap");
    }
    assert.equal(await page.getByTestId("inventory-pet-action-menu").getAttribute("data-menu-layout"),"inline");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByTestId("inventory-pet-action-menu").count(),0,
      sc.name+": Escape closes menu");

    await page.getByTestId("card-pet-egg-wait").click();
    await page.getByTestId("button-close-inv-speedup").waitFor({state:"visible"});
    await page.getByTestId("button-close-inv-speedup").click();
    await page.getByTestId("card-pet-egg-ready").click();
    assert.deepEqual(writes,["/api/pet/egg-ready/hatch-check"],
      sc.name+": ready eggs preserve hatch-check API and unready eggs keep speed-up sheet");
    await page.getByText("HATCHED!").first().waitFor({state:"visible"});

    const style=await page.getByTestId("inventory-featured-pet").evaluate(el=>{
      const s=getComputedStyle(el);
      return {border:s.borderColor,background:s.backgroundImage};
    });
    assert.match(style.background,/gradient/,sc.name+": forest spotlight backdrop renders");
    assert.equal(errors.length,0,sc.name+": no browser page errors: "+errors.join("; "));
    await ctx.close();
  }
}finally{
  await browser.close();
  await server.close();
}
console.log("Pet inventory featured spotlight browser smoke passed");
