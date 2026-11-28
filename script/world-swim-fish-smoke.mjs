import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real editor and renderer, isolated in the same translated scene used by the
// world pages. No live world data, inventories or purchases are involved.
const fixtureId = "/__world-swim-fish.tsx";
const fishId = "60000000-0000-4000-8000-000000000001";
const buildingId = "60000000-0000-4000-8000-000000000002";
const imageUrl = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="70" height="40"><path d="M0 0L18 20L0 40V0M18 20Q40 -8 70 20Q40 48 18 20" fill="#e5b44b"/></svg>').toString("base64");
const fish = {id:fishId,name:"Golden Fish",imageUrl,facingDirection:"right"};
const fixture = `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import WorldFishEditor from "@/components/world-editor/WorldFishEditor";
import WorldSwimFish from "@/components/WorldSwimFish";
import "@/index.css";
const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
function World(){
 const [scene,setScene]=useState({swimAreas:[],swimFish:[]}),[editing,setEditing]=useState(true),[room,setRoom]=useState(null),[pan,setPan]=useState(-120);
 const width=innerWidth+240,height=innerHeight+120,panY=-60;
 return <div style={{position:"absolute",inset:0,overflow:"hidden",background:"#174059"}}>
  <div style={{position:"absolute",left:pan,top:panY,width,height}}>
   <WorldSwimFish areas={scene.swimAreas} fish={scene.swimFish} buildingId={room} groundLevel={1}
    width={width} height={height} scale={1} panX={pan} panY={panY} viewportWidth={innerWidth} viewportHeight={innerHeight}/>
  </div>
  {editing?<WorldFishEditor key={room??"outside"} areas={scene.swimAreas} worldId="haunted_woods" worldName="Haunted Woods"
    buildingId={room} groundLevel={1} width={width} height={height} panX={pan} panY={panY}
    viewportWidth={innerWidth} viewportHeight={innerHeight} onSaved={setScene} onClose={()=>setEditing(false)}/>
    :<div style={{position:"absolute",top:10,left:10,zIndex:50,display:"flex",gap:8}}>
     <button onClick={()=>setEditing(true)}>Edit fish</button><button onClick={()=>setRoom(room?null:"${buildingId}")}>Switch room</button><button onClick={()=>setPan(-5000)}>Pan away</button>
    </div>}
 </div>
}
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><World/></QueryClientProvider>);
`;
const server = await createServer({
  server:{host:"127.0.0.1",port:4197,strictPort:true},
  plugins:[{name:"fish-fixture",
    resolveId:id=>id===fixtureId?id:null,load:id=>id===fixtureId?fixture:null,
    configureServer(s){s.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="'+fixtureId+'"></script></body></html>'));
    });}
  }],
});
await server.listen();
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:["--no-sandbox"]});
try {
  for(const [label,width,height] of [["phone",390,844],["tablet",834,1194]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    const errors=[],writes=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/fish-catalog?*",route=>route.fulfill({json:{fish:[fish],more:false}}));
    await page.route("**/swim-areas",route=>{
      const {areas}=route.request().postDataJSON();writes.push(areas);
      return route.fulfill({json:{swimAreas:areas,swimFish:[fish]}});
    });
    const cdp=await context.newCDPSession(page);
    const drag=async(from,to)=>{
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...from,id:1}]});
      for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    };
    await page.goto("http://127.0.0.1:4197/fixture");
    await page.getByTestId("world-fish-surface").waitFor();
    const from={x:width*.2,y:height*.2},to={x:width*.8,y:height*.45};
    const drop={x:width*.5,y:height*.32};
    await drag(from,to);
    await page.getByText("Swim area created. Choose a fish!").waitFor();
    assert.equal(writes.length,1);
    const {x,y}=writes[0][0];
    assert.ok(Math.abs(x-(from.x+120)/(width+240))<.005);
    assert.ok(Math.abs(y-(from.y+60)/(height+120))<.005);
    const choice=page.getByRole("button",{name:"Select Golden Fish"});
    await choice.waitFor();const tile=await choice.boundingBox();
    await drag({x:tile.x+tile.width/2,y:tile.y+tile.height/2},drop);
    await page.getByText("Golden Fish added!").waitFor();
    assert.equal(writes.length,2);assert.equal(writes[1][0].fish[0].fishId,fishId);
    await page.getByRole("button",{name:"Done",exact:true}).tap();
    assert.equal(await page.getByTestId("world-fish-area-outline").count(),0);
    const sprite=page.locator("[data-world-fish]");
    await sprite.waitFor();
    // Seek the actual CSS animation through all directions and inspect the
    // entire sprite's rendered bounds, not just the declared keyframes.
    const samples=await sprite.evaluate(el=>{
      const area=el.parentElement.getBoundingClientRect(), animation=el.getAnimations()[0];
      animation.pause();const duration=Number(animation.effect.getTiming().duration);
      return [0,.125,.25,.5,.75,.999].map(phase=>{
        animation.currentTime=duration*phase+Math.abs(Number(animation.effect.getTiming().delay));
        const r=el.getBoundingClientRect();return {x:r.x,inside:r.left>=area.left-.5&&r.right<=area.right+.5&&r.top>=area.top-.5&&r.bottom<=area.bottom+.5};
      });
    });
    assert.ok(samples.every(s=>s.inside));
    assert.ok(Math.max(...samples.map(s=>s.x))-Math.min(...samples.map(s=>s.x))>30);
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector("[data-world-fish]")).animationName==="none");
    assert.deepEqual(await sprite.evaluate(el=>[el,...el.querySelectorAll("*")].map(n=>getComputedStyle(n).animationName)),["none","none","none"]);
    await page.getByRole("button",{name:"Switch room"}).tap();
    assert.equal(await sprite.count(),0);
    await page.getByRole("button",{name:"Edit fish"}).tap();
    await drag(from,to);
    await page.getByText("Swim area created. Choose a fish!").waitFor();
    assert.equal(writes.at(-1)[1].buildingId,buildingId);
    // Tap-to-place fallback for users who prefer not to drag.
    await page.getByRole("button",{name:"Select Golden Fish"}).tap();
    await page.touchscreen.tap(drop.x,drop.y);
    await page.getByText("Golden Fish added!").waitFor();
    await page.getByRole("button",{name:"Done",exact:true}).tap();
    assert.equal(await sprite.count(),1);
    await page.getByRole("button",{name:"Switch room"}).tap();
    assert.equal(await sprite.count(),1);
    await page.getByRole("button",{name:"Pan away"}).tap();
    assert.equal(await sprite.count(),0);
    assert.deepEqual(errors,[]);
    console.log("PASS "+label+": actual touch draw, drag and tap fish, normalized save, room isolation, bounded swimming, reduced motion and offscreen culling");
    await context.close();
  }
} finally {await browser.close();await server.close();}
