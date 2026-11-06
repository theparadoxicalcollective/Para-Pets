import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Mount the REAL shared PlayerDetailPanel and its viewport portal. Mock only
// public read-only API responses; never mutate real user or pet records.
const fixtureId = "/__park-player-card-fixture.tsx";
const fixture = [
  'import React,{useState} from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
  'import {getQueryFn} from "@/lib/queryClient";',
  'import {TooltipProvider} from "@/components/ui/tooltip";',
  'import PlayerDetailPanel from "@/components/PlayerDetailPanel";',
  'import ViewportModalPortal from "@/components/ViewportModalPortal";',
  'import "@/index.css";',
  'const q=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});',
  'function Fixture(){const [open,setOpen]=useState(false);return <><button data-testid="fixture-park-pet" onClick={()=>setOpen(true)}>View park pet</button>{open&&<ViewportModalPortal><PlayerDetailPanel userId="guest-user" currentUserId="viewer" onClose={()=>setOpen(false)} presentation="popup"/></ViewportModalPortal>}</>;}',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={q}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);'
].join("\n");
const server=await createServer({server:{host:"127.0.0.1",port:4186,strictPort:true},plugins:[{
  name:"pet-park-profile-fixture",resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html"))return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" style="position:fixed;inset:0"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
  });}
}]});
const img="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><ellipse cx="80" cy="80" rx="48" ry="65" fill="#e7cd84"/></svg>').toString("base64");
const profile={id:"guest-user",username:"Guest Keeper",profileImage:img,isModerator:true,activePet:{
  inventoryId:"guest-companion",shopItemId:"demo",name:"Forest Bunny",nickname:null,rarity:5,
  petTemplateId:null,imageUrl:img,hatchedImageUrl:img,eggImageUrl:null,specialSkill:"Leaf Light",
  petLevel:32,petHealth:10000,petAtk:9000,petDef:6000,petLevelPoints:0
}};
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const [label,width,height] of [["small phone",320,700],["phone",390,844],["tablet",834,1194]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/api/**",route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==="/api/users/guest-user/profile")return route.fulfill({json:profile});
      if(path==="/api/users/guest-user/badges")return route.fulfill({json:[{id:"badge-1",name:"Founder",description:"Founder",imageUrl:img,awardedAt:new Date().toISOString()}]});
      if(path==="/api/friends/status/guest-user")return route.fulfill({json:{friendship:null}});
      if(path==="/api/pet/guest-companion/accessories/public")return route.fulfill({json:[]});
      if(path==="/api/pet/guest-companion/mini-pet/public")return route.fulfill({json:{equipped:null}});
      return route.fulfill({json:{}});
    });
    await page.goto("http://127.0.0.1:4186/park-profile-fixture",{waitUntil:"commit"});
    await page.getByTestId("fixture-park-pet").click();
    const card=page.getByTestId("panel-player-detail");
    await card.waitFor({state:"visible"});
    const username=page.getByTestId("text-player-username");
    await username.waitFor({state:"attached"});
    const usernameLayout=await username.evaluate(el=>{
      const box=el.getBoundingClientRect(),panel=document.querySelector('[data-testid="panel-player-detail"]');
      const cardBox=panel?.getBoundingClientRect();
      return {text:el.textContent,rect:box.toJSON(),computed:{
        display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,
        opacity:getComputedStyle(el).opacity,
      },panel:cardBox?.toJSON(),scrollTop:panel?.scrollTop,scrollHeight:panel?.scrollHeight};
    });
    console.log("PARK PROFILE LAYOUT",label,JSON.stringify(usernameLayout));
    assert.equal(usernameLayout.text,"Guest Keeper",label+": owner profile loaded");
    assert.ok(usernameLayout.rect.width>0 && usernameLayout.rect.height>0,label+": owner name has renderable dimensions");
    assert.equal(await page.getByTestId("overlay-player-detail").getAttribute("data-presentation"),"popup");
    assert.equal(await page.getByTestId("badge-badge-1").count(),1);
    assert.equal(await page.getByTestId("companion-showcase").count(),1);
    assert.equal(await page.getByTestId("active-pet-stats").count(),1);
    assert.equal(await page.getByTestId("button-add-friend").count(),1);
    assert.equal(await page.getByTestId("button-visit-pethouse").count(),1);
    assert.equal(await page.getByTestId("button-view-aquarium").count(),1);
    const rect=await card.evaluate(el=>{
      const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollable:el.scrollHeight>el.clientHeight,overflowY:getComputedStyle(el).overflowY};
    });
    assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1,label+": card fits horizontally");
    assert.ok(rect.y>=0&&rect.y+rect.height<=height,label+": card fits vertically");
    assert.equal(rect.overflowY,"auto",label+": constrained card remains scrollable");
    assert.deepEqual(errors,[],label+": no browser runtime errors");
    await page.getByTestId("button-close-player-detail").click();
    assert.equal(await page.getByTestId("overlay-player-detail").count(),0);
    await page.getByTestId("fixture-park-pet").click();
    await card.waitFor({state:"visible"});
    await page.mouse.click(3,3);
    assert.equal(await page.getByTestId("overlay-player-detail").count(),0,label+": outside click closes modal");
    console.log("PASS "+label+": shared gold player card in centered scrollable pop-up, badges, companion, stats, actions, close and outside dismissal");
    await context.close();
  }
}finally{await browser.close();await server.close();}
