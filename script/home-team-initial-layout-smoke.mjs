import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Real Home HUD + PetAnimator; disposable API fixtures model mixed cached and
// delayed templates, padded/off-center sprites, costumes and a full five-pet team.
const moduleId = "/__home-team-initial-layout-fixture.tsx";
const art = i => "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><ellipse cx="' +
  (48 + 10 * i) + '" cy="86" rx="' + (21 + i * 3) + '" ry="44" fill="#bca66d"/></svg>'
).toString("base64");
const templates = Array.from({length: 5}, (_, i) => ({
  facing: "front", canFly: false, parts: [{
    id: "body" + i, templateId: "template" + i, partType: "body", view: "front",
    imageUrl: art(i), posX: 0, posY: 0, width: 1000, height: 1000,
    zIndex: 30, pivotX: 50, pivotY: 50, rotation: 0,
  }],
}));
const costumes = i => ({
  equipped: [{ id: "costume" + i, slot: 1, name: "Fixture adornment", imageUrl: art(i),
    placements: [{ view: "front", anchorPart: "independent", depth: "front", dontMove: true,
      posX: 350, posY: 150, width: 200, height: 200, pivotX: 50, pivotY: 50 }] }],
  extraSlots: 0, isEvolved: false,
});
const pets = Array.from({length: 5}, (_, i) => ({
  inventoryId: "pet" + i, name: "Companion " + i, petNickname: null, type: "pet",
  isHatched: true, isListed: false, rarity: i + 1, petTemplateId: "template" + i,
  imageUrl: art(i), hatchedImageUrl: art(i),
}));
const fixture = [
  'import React,{useState} from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
  'import HomePlayerHud from "@/components/HomePlayerHud";',
  'import ViewportHudPortal from "@/components/ViewportHudPortal";',
  'import "@/index.css";',
  'const qc=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});',
  'qc.setQueryData(["/api/pet-template-parts","template0"],'+JSON.stringify(templates[0])+');',
  'qc.setQueryData(["/api/pet","pet0","costumes","owner"],'+JSON.stringify(costumes(0))+');',
  'const pets='+JSON.stringify(pets)+';',
  'function Fixture(){const [mounted,setMounted]=useState(true); window.__showHome=setMounted;return mounted?<ViewportHudPortal><HomePlayerHud userId="fixture-user" username="QA" inventory={pets} inventoryLoading={false} inventoryReady={true} inventoryError={false} avatarHome /></ViewportHudPortal>:null;}',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}><Fixture/></QueryClientProvider>);',
].join("\n");
const server = await createServer({
  server: {host: "127.0.0.1", port: 4201, strictPort: true},
  plugins: [{name:"home-team-init-fixture", resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      if(!req.headers.accept?.includes("text/html"))return next();
      res.setHeader("Content-Type","text/html");
      res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" style="position:fixed;inset:0" data-coordinate-owner="viewport"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
    });},
  }],
});
await server.listen();
const browser=await chromium.launch({headless:true});
try {
  for (const [label,width,height] of [["compact phone",320,568],["phone",390,844],["tablet",834,1194]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[],writes=[];
    // Capture the first *paintable* fitted frame and every width transition
    // rather than only testing a fully settled, warm page.
    await page.addInitScript(()=>{
      window.__homeFrameChecks={count:0,errors:[]};
      function check(){
        for(const slot of document.querySelectorAll(".home-player-hud__slot--templated")){
          const core=slot.querySelector('[data-testid="pet-animator"][data-visible-fit-ready="true"]');
          const renderer=slot.querySelector(".home-player-hud__pet-renderer");
          if(!core || !renderer || Number(getComputedStyle(renderer).opacity)===0)continue;
          const canvas=core.firstElementChild, size=Math.min(core.clientWidth,core.clientHeight);
          if(!canvas || !size)continue;
          window.__homeFrameChecks.count++;
          if((Math.abs(canvas.offsetWidth-size)>2 || Math.abs(canvas.offsetHeight-size)>2) &&
             window.__homeFrameChecks.errors.length<10){
            window.__homeFrameChecks.errors.push({slot:slot.dataset.visualPosition,size,width:canvas.offsetWidth,height:canvas.offsetHeight});
          }
        }
        requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    });
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/api/**",async route=>{
      const path=new URL(route.request().url()).pathname, method=route.request().method();
      if(method!=="GET")writes.push([method,path]);
      if(path==="/api/player/pet-team")return route.fulfill({json:{petInventoryIds:pets.map(p=>p.inventoryId),attackPower:100}});
      if(path==="/api/player/progression")return route.fulfill({json:{level:1,totalXp:0,cycleXp:0,stars:1,nextLevelTotalXp:80,xpToNextLevel:80}});
      if(path==="/api/settings/home-xp-anchor")return route.fulfill({json:{anchor:null}});
      const template=path.match(/^\/api\/pet-template-parts\/template(\d)$/);
      if(template) {
        await new Promise(r=>setTimeout(r,250+Number(template[1])*130));
        return route.fulfill({json:templates[Number(template[1])]});
      }
      const costume=path.match(/^\/api\/pet\/pet(\d)\/costumes$/);
      if(costume) {
        await new Promise(r=>setTimeout(r,50+Number(costume[1])*80));
        return route.fulfill({json:costumes(Number(costume[1]))});
      }
      const mini=path.match(/^\/api\/pet\/pet(\d)\/mini-pet$/);
      if(mini)return route.fulfill({json:{equipped:{inventoryId:"mini"+mini[1],shopItemId:"mini-shop",name:"Mini",imageUrl:art(0),rarity:1,atkBoost:0,healthBoost:0,defBoost:0,animationStyle:"float",parts:[]}}});
      return route.fulfill({json:{}});
    });
    async function verifyLayout(phase){
      await page.waitForFunction(()=>document.querySelectorAll('.home-player-hud__pet-renderer [data-visible-fit-ready="true"]').length===5);
      await page.waitForFunction(()=>[...document.querySelectorAll('.home-player-hud__pet-renderer')].every(el=>Number(getComputedStyle(el).opacity)>=.99));
      const measurements=await page.locator('.home-player-hud__slot--templated').evaluateAll(slots=>slots.map(slot=>{
        const core=slot.querySelector('[data-testid="pet-animator"]'),canvas=core.firstElementChild;
        const costumes=slot.querySelector('[data-testid="pet-animator-costumes-front"] > div');
        const mini=slot.querySelector('[data-testid="equipped-mini-pet"]');
        const i=Number(slot.dataset.testid.replace("home-player-team-slot-",""))-1;
        const canvasRect=canvas.getBoundingClientRect(), coreRect=core.getBoundingClientRect();
        const oval=slot.parentElement.querySelector('[data-testid="home-player-team-ground-'+slot.dataset.visualPosition+'"]').getBoundingClientRect();
        // The authored ellipse is deliberately off-center in its transparent
        // square. Fit must center that visible silhouette, not the PNG box.
        const bodyCenterX=canvasRect.x+canvasRect.width*(48+10*i)/160;
        const bodyBottom=canvasRect.y+canvasRect.height*130/160;
        return {slot:slot.getAttribute("data-visual-position"), coreWidth:core.clientWidth, coreHeight:core.clientHeight,
          centerError:Math.abs(bodyCenterX-(coreRect.x+coreRect.width/2)),
          footError:Math.abs(bodyBottom-oval.bottom),
          canvasWidth:canvas.offsetWidth,canvasHeight:canvas.offsetHeight, offsetLeft:canvas.offsetLeft,offsetTop:canvas.offsetTop,
          transform:canvas.style.transform,costumeWidth:costumes?.offsetWidth,costumeHeight:costumes?.offsetHeight,
          costumeLeft:costumes?.offsetLeft,costumeTop:costumes?.offsetTop,costumeTransform:costumes?.style.transform,mini:!!mini};
      }));
      assert.equal(measurements.length,5);
      for(const m of measurements){
        const size=Math.min(m.coreWidth,m.coreHeight);
        assert.ok(Math.abs(m.canvasWidth-size)<=2 && Math.abs(m.canvasHeight-size)<=2,
          label+" "+phase+": pet must fill the actual assigned oval, not an early 58px measurement: "+JSON.stringify(m));
        assert.equal(m.offsetLeft,0,label+" "+phase+": canvas uses same local origin");
        assert.equal(m.offsetTop,0);
        assert.equal(m.costumeWidth,m.canvasWidth,label+" "+phase+": adornment and pet share canvas width");
        assert.equal(m.costumeHeight,m.canvasHeight);
        assert.equal(m.costumeLeft,m.offsetLeft);
        assert.equal(m.costumeTop,m.offsetTop);
        assert.equal(m.costumeTransform,m.transform,label+" "+phase+": adornments share exactly the same alpha-fit transform");
        assert.ok(m.centerError<=5,label+" "+phase+": alpha-tight silhouette is centered on its assigned oval: "+JSON.stringify(m));
        assert.ok(m.footError<=12,label+" "+phase+": visible pet stands near its oval, rather than floating above it: "+JSON.stringify(m));
        assert.ok(m.mini,label+" "+phase+": Mini Pet remains attached");
      }
      return measurements;
    }
    await page.goto("http://127.0.0.1:4201/fixture",{waitUntil:"commit"});
    await verifyLayout("mixed-cache first load");
    const ovalBounds=()=>page.locator('.home-player-hud__slot-ground').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
    const before=await ovalBounds();
    await page.getByTestId("home-player-team-slots").press("ArrowRight");
    await page.waitForFunction(()=>document.querySelector('[data-testid="home-player-team-slot-1"]')?.getAttribute("data-visual-position")==="4");
    await page.waitForTimeout(340);
    await verifyLayout("rotated");
    assert.deepEqual(await ovalBounds(),before,label+": the five ovals are fixed while pets rotate");
    await page.setViewportSize({width:width===834?390:834,height:width===834?844:1194});
    await page.waitForTimeout(340);
    await verifyLayout("viewport resized");
    await page.evaluate(()=>window.__showHome(false));
    await page.getByTestId("home-player-hud").waitFor({state:"detached"});
    await page.evaluate(()=>window.__showHome(true));
    await verifyLayout("cached return");
    const frames=await page.evaluate(()=>window.__homeFrameChecks);
    assert.ok(frames.count>=5,label+": sampled first paint and carousel transition frames");
    assert.deepEqual(frames.errors,[],label+": no paintable frame uses a stale pixel canvas");
    assert.deepEqual(writes,[],label+": neither resizing, rotation nor returning writes roster or game data");
    assert.deepEqual(errors,[],label+": no browser exceptions");
    console.log("PASS "+label+": mixed cache, delayed templates, alpha fit, synchronized adornments, carousel, resize, cached return");
    await context.close();
  }
} finally {await browser.close();await server.close();}
