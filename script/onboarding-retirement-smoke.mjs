import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// The discontinued Begin Journey must not mount, navigate, grant starter
// items or intercept hatching. This exercises the actual player Home,
// FloatingNav and Quest Log on phone and tablet with isolated API fixtures.
const fixtureId = "/__retired-onboarding-fixture.tsx";
const fixture = `
import React, {useEffect} from "react";
import {createRoot} from "react-dom/client";
import {useLocation} from "wouter";
import {QueryClientProvider, useQuery} from "@tanstack/react-query";
import {queryClient} from "@/lib/queryClient";
import {useStageViewportLayout,publishStageViewportCss} from "@/lib/stageViewport";
import HomePage from "@/pages/HomePage";
import FloatingNav from "@/components/FloatingNav";
import {TooltipProvider} from "@/components/ui/tooltip";
import {Toaster} from "@/components/ui/toaster";
import "@/index.css";
queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});
function Fixture(){
 const [location]=useLocation();
 const layout=useStageViewportLayout(location);
 const {data:user}=useQuery({queryKey:["/api/auth/me"]});
 useEffect(()=>{
   publishStageViewportCss(layout);
   Object.assign(document.getElementById("game-stage").style,{position:"absolute",left:layout.left+"px",
    top:layout.top+"px",width:layout.designWidth+"px",height:layout.designHeight+"px",overflow:"hidden"});
 },[layout]);
 if(!user)return null;
 return <><div style={{position:"absolute",inset:0,pointerEvents:"auto"}}>
    <HomePage user={user}/></div><FloatingNav user={user}/><Toaster/></>;
}
createRoot(document.getElementById("root")).render(
 <QueryClientProvider client={queryClient}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);
`;
const server=await createServer({server:{host:"127.0.0.1",port:4175,strictPort:true},plugins:[{
 name:"isolated-onboarding-retirement",
 resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(!req.headers.accept?.includes("text/html"))return next();
   res.setHeader("Content-Type","text/html");
   res.end(await server.transformIndexHtml(req.url,
     '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
     '<div class="game-stage-shell" style="position:fixed;inset:0;overflow:hidden">'+
     '<div id="game-stage" data-coordinate-owner="viewport">'+
     '<div id="game-viewport-page" style="position:absolute;inset:0;pointer-events:none;z-index:20"></div>'+
     '<div id="game-viewport-backdrop" style="position:absolute;inset:0;pointer-events:none;z-index:17"></div>'+
     '<div id="game-viewport-scene" style="position:absolute;inset:0;pointer-events:none;z-index:30"></div>'+
     '<div id="root" style="position:absolute;inset:0;z-index:15"></div>'+
     '<div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:40"></div>'+
     '</div></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
 });},
}]});
await server.listen();
const browser=await chromium.launch({headless:true});
const art="data:image/svg+xml;base64,"+Buffer.from(
 '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><ellipse cx="100" cy="100" rx="70" ry="90" fill="#f1cf70"/></svg>',
).toString("base64");
const profiles=[["compact phone",320,568],["Android phone",360,800],
 ["iPhone size",390,844],["large phone",430,932],
 ["Android tablet",800,1280],["tablet",834,1194]];
try {
 for(const [name,width,height] of profiles){
  const historical=width===360 || width===800;
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  if(historical) await context.addInitScript(() => {
    localStorage.setItem("bj_step:journey-fixture","5");
    localStorage.setItem("bj_starter_inventory_id:journey-fixture","original-starter");
  });
  const page=await context.newPage();
  page.setDefaultTimeout(16000);
  const errors=[],requests=[];
  page.on("pageerror",error=>errors.push(error.message));
  const user={id:"journey-fixture",username:"QA",email:"qa@example.invalid",
    coins:1200,isAdmin:false,isModerator:false,emailVerified:true,profileImage:null,
    activePetId:historical?"egg-owned":null,tutorial_quest_completed:historical,
    tutorial_reward_claimed:historical};
  const egg={inventoryId:"egg-owned",id:"egg-owned",shopItemId:"egg-template",
    name:"Forest Egg",type:"pet",rarity:3,starRarity:3,isHatched:false,hatchTime:3,
    hatchStartedAt:null,eggImageUrl:art,hatchedImageUrl:art,imageUrl:art,
    petTemplateId:null,petLevel:1,petHp:10,petAtk:1,petDef:1,quantity:1};
  const potion={inventoryId:"potion-owned",shopItemId:"potion-template",id:"potion-owned",
    type:"special",specialType:"hatch_time",specialAmount:60,
    name:"Hatching Potion",imageUrl:art,quantity:3};
  const fulfill=(route,json,status=200)=>route.fulfill({status,json});
  await page.route("**/api/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    requests.push({method:route.request().method(),path});
    if(path.startsWith("/api/tutorial/"))return fulfill(route,{message:"retired tutorial must not be used"},410);
    if(path==="/api/auth/me")return fulfill(route,user);
    if(path==="/api/inventory")return fulfill(route,[egg,potion]);
    // 09/12 reads account progression and the shared PvP/Raid team on Home;
    // supply their real shapes instead of the legacy catch-all [] fixture.
    if(path==="/api/player/progression")
      return fulfill(route,{level:1,totalXp:0,nextLevelTotalXp:null,xpToNextLevel:null});
    if(path==="/api/player/pet-team")
      return fulfill(route,{petInventoryIds:[],attackPower:0});
    if(path==="/api/quests/daily" || path==="/api/quests/janson")return fulfill(route,{quests:[]});
    if(path==="/api/quests/ginny-mini-pet")return fulfill(route,{status:"available"});
    if(path==="/api/friends/requests/count")return fulfill(route,{count:0});
    if(path.includes("pet-page-placement"))return fulfill(route,{x:0,y:0,scale:1});
    if(path==="/api/active-pet-anchor")return fulfill(route,{x:0,y:0});
    return fulfill(route,[]);
  });
  await page.goto("http://127.0.0.1:4175/",{waitUntil:"domcontentloaded",timeout:30000});
  await page.getByTestId("button-floating-nav").waitFor({state:"visible",timeout:30000});
  assert.equal(await page.getByTestId("button-begin-journey").count(),0);
  assert.equal(await page.getByTestId("begin-journey-forwarder").count(),0);
  assert.equal(await page.getByText("Begin Here",{exact:true}).count(),0);
  await page.getByTestId("button-floating-nav").tap();
  await page.getByTestId("nav-item-quest").tap();
  const questLog=page.getByTestId("quest-log-viewport-overlay");
  await questLog.waitFor({state:"visible"});
  assert.equal(await questLog.getByText("Begin Journey",{exact:true}).count(),0);
  await questLog.getByText("No active quests. Explore the realm to discover adventures...")
    .waitFor({state:"visible"});
  if(historical){
    assert.equal(await page.evaluate(()=>localStorage.getItem("bj_step:journey-fixture")),"5",
      name+": historical saved step retained for future migration");
    await page.getByTestId("quest-log-viewport-backdrop").click({position:{x:7,y:7}});
    // Avatar 10/12 removes Home's pet actor; owned eggs remain in Bag.
    // Direct egg routes and incubation behavior are tested separately.
    assert.equal(await page.getByTestId("button-egg-tap").count(),0);
    assert.equal(await page.getByTestId("button-open-pet-menu").count(),0);
  }
  assert.equal(requests.filter(x=>x.path.startsWith("/api/tutorial/")).length,0,
    name+": no retired tutorial calls");
  assert.deepEqual(errors,[],name+": no client runtime errors");
  console.log("PASS "+name+": no old onboarding, quests accessible, historical state safe, normal egg sheet");
  await context.close();
 }
}finally{await browser.close();await server.close();}
