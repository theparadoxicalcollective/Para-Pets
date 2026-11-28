import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Exercise the actual map and Worlds admin panel against disposable settings.
const moduleId = "/__world-access-fixture.tsx";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {useLocation} from "wouter";
import {getQueryFn} from "@/lib/queryClient";
import {TooltipProvider} from "@/components/ui/tooltip";
import MapPage from "@/pages/MapPage";
import WorldAccessPanel from "@/components/admin/WorldAccessPanel";
import "@/index.css";
const role = new URLSearchParams(location.search).get("role");
const admin = role==="admin";
const user={id:"qa",username:"QA",email:"qa@example.invalid",profileImage:null,coins:0,isAdmin:admin,isModerator:role==="moderator",activePetId:null,lastUsernameChange:null,lastProfilePicChange:null};
const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});
window.refreshAccess=()=>client.invalidateQueries({queryKey:["/api/world-scene-publications"]});
function Fixture(){
  const [path,navigate]=useLocation();
  if(path==="/map")return <MapPage user={user}/>;
  if(path==="/admin-worlds")return <div className="absolute inset-0 overflow-auto p-4"><WorldAccessPanel/><button data-testid="map" onClick={()=>navigate("/map")}>Map</button></div>;
  return <div data-testid="destination">{path}</div>;
}
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);
`;
const server = await createServer({
  server:{host:"127.0.0.1",port:4196,strictPort:true},
  plugins:[{name:"world-access-fixture",resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="game-stage" data-coordinate-owner="viewport" style="position:absolute;inset:0;--vw:1vw;--vh:1vh"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none;z-index:50"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });}}]
});
const ids=["snowy_mountain","sky_realm","volcanic","island","desert","enchanted_grove","haunted_woods","swamp"];
const art="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="44" fill="#375c39"/></svg>').toString("base64");
const worlds=[
  {id:"snowy_mountain",name:"Frostpeak",posX:10,posY:10},
  {id:"swamp",name:"Bayou",posX:55,posY:10},
].map(w=>({...w,iconUrl:art,bgUrl:null,iconSize:24,glowColor:"#ffd700",isDefault:true}));
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{})});
try{
  for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]){
    const locks=Object.fromEntries(ids.map(id=>[id,!["swamp","volcanic","haunted_woods"].includes(id)]));
    const writes=[];
    const errors=[];
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const admin=await context.newPage(),player=await context.newPage(),moderator=await context.newPage();
    for(const [page,isAdmin] of [[admin,true],[player,false],[moderator,false]]){
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("**/api/**",route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(path==="/api/world-scene-publications")return route.fulfill({json:ids.map(worldId=>({worldId,active:true,hasBeenLive:true,locked:locks[worldId]}))});
        if(path==="/api/worlds")return route.fulfill({json:worlds});
        if(path==="/api/raid-status")return route.fulfill({json:{raidVisible:false}});
        if(path==="/api/settings/map-background")return route.fulfill({json:{bgUrl:null}});
        const match=path.match(/^\/api\/admin\/worlds\/([^/]+)\/lock$/);
        if(match&&req.method()==="PUT"){
          assert.equal(isAdmin,true);
          const {locked}=req.postDataJSON();
          locks[match[1]]=locked;
          writes.push([match[1],locked]);
          return route.fulfill({json:{worldId:match[1],locked}});
        }
        return route.fulfill({json:{}});
      });
    }
    for (const [page,role] of [[player,"player"],[moderator,"moderator"]]) {
      await page.goto("http://127.0.0.1:4196/map?role="+role);
      await page.getByTestId("world-locked-snowy_mountain").waitFor();
      await page.getByTestId("button-location-snowy_mountain").tap({force:true});
      await page.getByTestId("modal-world-coming-soon").waitFor();
      assert.match(await page.getByTestId("modal-world-coming-soon").innerText(),/Coming Soon/);
      assert.equal(await page.getByTestId("destination").count(),0);
      await page.getByRole("button",{name:"Close",exact:true}).tap();
      await page.getByTestId("modal-world-coming-soon").waitFor({state:"hidden"});
    }
    await admin.goto("http://127.0.0.1:4196/admin-worlds?role=admin");
    await admin.getByTestId("admin-world-access").waitFor();
    assert.equal(await admin.getByRole("switch").count(),8);
    assert.equal(await admin.getByRole("button",{name:"Open original map (admin)"}).count(),3);
    await admin.getByTestId("toggle-world-lock-snowy_mountain").tap();
    await admin.waitForFunction(()=>document.querySelector('[data-testid="toggle-world-lock-snowy_mountain"]')?.getAttribute("aria-checked")==="true");
    for (const page of [player,moderator]) {
      await page.evaluate(()=>window.refreshAccess());
      await page.getByTestId("world-locked-snowy_mountain").waitFor({state:"hidden"});
      await page.getByTestId("button-location-snowy_mountain").tap({force:true});
      await page.getByTestId("destination").waitFor();
      assert.equal(await page.getByTestId("destination").innerText(),"/world/snowy_mountain");
    }
    // Lock an already-public world and ensure admin can still edit it from map.
    await admin.getByTestId("toggle-world-lock-swamp").tap();
    await admin.waitForFunction(()=>document.querySelector('[data-testid="toggle-world-lock-swamp"]')?.getAttribute("aria-checked")==="false");
    await player.goto("http://127.0.0.1:4196/map?role=player");
    await player.getByTestId("world-locked-swamp").waitFor();
    await moderator.goto("http://127.0.0.1:4196/map?role=moderator");
    await moderator.getByTestId("world-locked-swamp").waitFor();
    await moderator.getByTestId("button-location-swamp").tap({force:true});
    await moderator.getByTestId("modal-world-coming-soon").waitFor();
    await admin.getByTestId("map").tap();
    await admin.getByTestId("button-location-swamp").waitFor();
    assert.equal(await admin.getByTestId("world-locked-swamp").count(),0);
    assert.equal(await admin.getByTestId("button-switch-world-swamp").count(),0);
    await admin.getByTestId("button-location-swamp").tap({force:true,position:{x:40,y:55}});
    await admin.getByTestId("destination").waitFor();
    assert.equal(await admin.getByTestId("destination").innerText(),"/world-editor/swamp");
    assert.deepEqual(writes,[["snowy_mountain",false],["swamp",true]]);
    assert.deepEqual(errors,[]);
    console.log("PASS "+name+": player/moderator map locks, Coming Soon, independent admin toggles and direct editor entry");
    await context.close();
  }
} finally {await browser.close();await server.close();}
