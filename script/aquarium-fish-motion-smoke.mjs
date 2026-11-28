import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

const fixtureId="/__aquarium-motion-fixture.tsx";
const fixture=`
import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {getQueryFn} from "@/lib/queryClient";
import {AquariumPage} from "@/pages/AquariumPage";
import "@/index.css";
const client=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"throw"}),retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><AquariumPage userId="fish-qa" onClose={()=>{}} readOnly={location.search.includes("visitor")}/></QueryClientProvider>);
`;
const server=await createServer({server:{host:"127.0.0.1",port:4295,strictPort:true},plugins:[{
  name:"aquarium-motion-fixture",resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
  configureServer(s){s.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html"))return next();
    res.setHeader("Content-Type","text/html");
    res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="position:absolute;inset:0"></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
  });}
}]});
const fishSvg='<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><path d="M2 10 L24 28 L2 49 L2 10 M20 30 Q46 -6 79 30 Q46 67 20 30" fill="#d4be71"/><circle cx="60" cy="25" r="4" fill="#182a36"/></svg>';
const imageUrl="data:image/svg+xml;base64,"+Buffer.from(fishSvg).toString("base64");
const leftImageUrl="data:image/svg+xml;base64,"+Buffer.from(fishSvg.replace("<path",'<g transform="translate(80 0) scale(-1 1)"><path').replace("</svg>","</g></svg>")).toString("base64");
const species=(id,rarity,zone="full",facing="right",hasParts=false)=>({id,name:id,imageUrl:facing==="left"?leftImageUrl:imageUrl,starRarity:rarity,fishSwimZone:zone,facingDirection:facing,hasParts,isSeaAnimal:false});
const minnow=species("Minnow",1,"full","left"), floor=species("Loach",2,"bottom","right"),
  rare=species("Rare",3), large=species("Large",4,"bottom"), huge=species("Huge",5,"bottom","left"),
  parts1=species("Small parts",1,"full","right",true),parts5=species("Large parts",5,"bottom","left",true);
const caught=(id,item,slot="main")=>({id,shopItemId:item.id,caughtAt:"2026-01-01",inAquarium:true,aquariumSlot:slot,item});
const inventory=[caught("minnow1",minnow),caught("minnow2",minnow),caught("loach1",floor),caught("loach2",floor),
  caught("rare1",rare),caught("rare2",rare),caught("large",large),caught("huge",huge),
  caught("parts1",parts1),caught("parts5",parts5),caught("bayou",floor,"bayou")];
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:["--no-sandbox","--disable-dev-shm-usage"]});
try {
  for(const [label,width,height] of [["phone",390,844],["tablet",834,1194]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const page=await context.newPage(),errors=[],writes=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.addInitScript(()=>{
      let seed=8145;
      Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    });
    await page.route("**/api/**",route=>{
      const path=new URL(route.request().url()).pathname;
      if(route.request().method()!=="GET") writes.push(path);
      if(path==="/api/fishing/inventory")return route.fulfill({json:inventory});
      if(path==="/api/aquarium/favorite")return route.fulfill({json:{aquarium:"main"}});
      if(path==="/api/aquarium/unlocks")return route.fulfill({json:{unlocks:["bayou","volcanic"]}});
      if(path==="/api/auth/me")return route.fulfill({json:{coins:0}});
      if(path==="/api/users/fish-qa/aquarium")return route.fulfill({json:{aquarium:"main",fish:inventory.filter(f=>f.aquariumSlot==="main")}});
      if(path.startsWith("/api/fish-parts/"))return route.fulfill({json:[{id:"body",partType:"body",imageUrl:decodeURIComponent(path).endsWith("/Large parts")?leftImageUrl:imageUrl,posX:0,posY:0,width:500,height:500,zIndex:1}]});
      return route.fulfill({json:{}});
    });
    const fish=id=>page.locator('[data-aquarium-fish="'+id+'"]');
    const read=()=>page.locator("[data-aquarium-fish]").evaluateAll(els=>{
      const tank=document.querySelector('[data-testid="aquarium-page"]').getBoundingClientRect();
      return Object.fromEntries(els.map(el=>{
        const r=el.getBoundingClientRect(), art=el.firstElementChild;
        return [el.dataset.aquariumFish,{tankWidth:tank.width,x:r.x,y:r.y,w:r.width,h:r.height,relativeBottom:(r.bottom-tank.top)/tank.height,
          inBounds:r.x>=tank.x-.5&&r.right<=tank.right+.5&&r.top>=tank.top-.5&&r.bottom<=tank.bottom+.5,
          face:getComputedStyle(art).transform==="none"?1:Math.sign(new DOMMatrixReadOnly(getComputedStyle(art).transform).a),
          schooling:el.dataset.fishSchooling}];
      }));
    });
    await page.goto("http://127.0.0.1:4295/aquarium");
    await fish("parts5").locator('img').waitFor();
    await fish("minnow1").waitFor();
    const before=await read();
    assert.equal(Object.keys(before).length,10);
    assert.ok(before.minnow1.w<before.rare1.w&&before.rare1.w<before.large.w&&before.large.w<before.huge.w);
    assert.ok(before.parts1.w<before.parts5.w);
    for(const id of ["loach1","loach2","large","huge","parts5"]){
      assert.ok(before[id].relativeBottom>=.899&&before[id].relativeBottom<=1.001,id+" does not stay on the floor");
    }
    assert.ok(Object.values(before).every(f=>f.inBounds));
    // Check actual orientation during consecutive short rendered steps; the
    // bitmap and layered renderer share the same native-art facing policy.
    const leftFacing=new Set(["minnow1","minnow2","huge","parts5"]);
    let previous=before, verified=new Set();
    let schoolSeen=false, independentSeen=false;
    for(let i=0;i<25;i++){
      await page.waitForTimeout(110);
      const current=await read();
      for(const [id,f] of Object.entries(current)){
        assert.ok(f.inBounds,id+" clipped");
        if(["loach1","loach2","large","huge","parts5"].includes(id)){
          assert.ok(f.relativeBottom>=.899&&f.relativeBottom<=1.001);
          assert.ok(Math.abs(f.x-before[id].x)<=f.tankWidth*.061, id+" left its local crawl region");
          assert.ok(Math.abs(f.relativeBottom-before[id].relativeBottom)<=.014, id+" bobs too far");
        }
        const dx=f.x-previous[id].x;
        // Very near a turn the end heading may differ from a multi-frame
        // sample. Compare frames with an unchanged heading only.
        if(Math.abs(dx)>.12&&f.face===previous[id].face){
          assert.equal(f.face,(dx>0)===!leftFacing.has(id)?1:-1,id+" swims backwards");
          verified.add(id);
        }
      }
      assert.notEqual(current.rare1.schooling,"true");assert.notEqual(current.rare2.schooling,"true");
      schoolSeen ||= current.minnow1.schooling==="true"&&current.minnow2.schooling==="true" || current.loach1.schooling==="true"&&current.loach2.schooling==="true";
      independentSeen ||= current.minnow1.schooling!=="true" || current.loach1.schooling!=="true";
      previous=current;
    }
    assert.ok(verified.size>=8,"rendered direction checked for most fish including slow floor dwellers");
    // The deterministic unit simulation verifies whole school cycles;
    // here verify mounted real fish follow the school flag and no rare joins.
    assert.ok(schoolSeen&&independentSeen,"real eligible fish enter school and solo phases");
    await page.emulateMedia({reducedMotion:"reduce"});
    const still=await read();await page.waitForTimeout(200);assert.deepEqual(await read(),still);
    await fish("minnow1").tap();
    await page.getByRole("button",{name:"Keep Swimming"}).waitFor();
    await page.getByRole("button",{name:"Keep Swimming"}).tap();
    await page.getByRole("button",{name:"Next aquarium"}).tap();
    await fish("bayou").waitFor();
    assert.equal(await page.locator("[data-aquarium-fish]").count(),1);
    assert.ok((await read()).bayou.relativeBottom>=.899);
    await page.goto("http://127.0.0.1:4295/aquarium?visitor=1");
    await fish("huge").waitFor();
    assert.equal(await page.locator("[data-aquarium-fish]").count(),10);
    assert.ok((await read()).huge.relativeBottom>=.899);
    assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log("PASS "+label+": real aquarium bitmap/parts sizing, facing, bottom zone, school eligibility, tap, slot and visitor isolation, reduced motion");
    await context.close();
  }
} finally {await browser.close();await server.close();}
