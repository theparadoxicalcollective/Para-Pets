import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Run real PetParkPage pointer handlers against isolated, disposable API data.
const moduleId = "/__indoor-park-fixture.tsx";
const fixture = [
  'import React from "react";',
  'import { createRoot } from "react-dom/client";',
  'import { QueryClient, QueryClientProvider } from "@tanstack/react-query";',
  'import { getQueryFn } from "@/lib/queryClient";',
  'import { TooltipProvider } from "@/components/ui/tooltip";',
  'import PetParkPage from "@/pages/PetParkPage";',
  'import "@/index.css";',
  'const q=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={q}><TooltipProvider><PetParkPage/></TooltipProvider></QueryClientProvider>);',
].join("\n");

const server = await createServer({server:{host:"127.0.0.1",port:4183,strictPort:true},plugins:[{
  name:"pet-park-indoor-fixture", resolveId:id=>id===moduleId?id:null, load:id=>id===moduleId?fixture:null,
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html")) return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="game-stage" style="position:absolute;inset:0" data-coordinate-owner="viewport"><div id="root" style="position:absolute;inset:0"></div><div id="game-viewport-hud" style="position:absolute;inset:0;pointer-events:none"></div></div><script type="module" src="'+moduleId+'"></script></body></html>'));
  });}
}]});
const svg = value => "data:image/svg+xml;base64,"+Buffer.from(value).toString("base64");
const house = svg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="20" y="20" width="160" height="160" fill="#3c7851"/></svg>');
const roomImage = svg('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1000"><rect width="700" height="1000" fill="#ad8f60"/></svg>');
const petImage = svg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><ellipse cx="100" cy="95" rx="62" ry="70" fill="#d8c5a2"/></svg>');

await server.listen();
const browser = await chromium.launch({headless:true});
try {
  for (const [label,width,height] of [["phone",390,844],["tablet",834,1194]]) {
    const context = await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[],saves=[],claims=[],idleReturns=[];
    page.on("pageerror",error=>errors.push(error.message));
    const owned={petInventoryId:"owner-pet",petTemplateId:null,hatchedImageUrl:petImage,petName:"Pet",petNickname:"My Pet",rarity:4,petLevel:32,ownerName:"Owner",ownerId:"owner",buildingId:"cottage",roomEffectId:null,interiorXPct:.37,interiorYPct:.60,parkXPct:null,parkYPct:null,pose:"idle"};
    const guest={...owned,petInventoryId:"guest-pet",ownerName:"Guest",ownerId:"guest",interiorXPct:.77,rarity:3};
    let scene={enabledForPlayers:true,canEnterPark:true,canEditPark:false,groundLevel:1,unlockedSlots:2,items:[],rates:{coinsPerHour:60,essencePerHour:24,petXpPerHour:300},serverNow:new Date().toISOString(),
      buildings:[{id:"cottage",name:"Fixture Cottage",imageUrl:house,interiorImageUrl:roomImage,xPct:.5,yPct:.5,size:420,flipped:false,layer:0,maxPets:20,interiorEffects:[{id:"sleep1",type:"sleep",x:.58,y:.6,size:18}]}],
      sharedPets:[owned,guest],deposits:[{...owned,id:"owner-deposit",slotNumber:1,checkpointAt:new Date().toISOString(),pausedAt:null,pausedDurationMs:0,earnedDurationMs:0}]};
    await page.route("**/api/**",route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==="/api/pet-park/scene")return route.fulfill({json:scene});
      if(path==="/api/pet-park/status")return route.fulfill({json:{enabledForPlayers:true,canEnterPark:true}});
      if(path==="/api/inventory")return route.fulfill({json:[]});
      if(path==="/api/pet-park/deposits/owner-deposit/claim"){
        claims.push(route.request().method());
        return route.fulfill({json:{coins:1,essence:0,petXp:1}});
      }
      if(path==="/api/pet-park/deposits/owner-deposit/display"){
        const body=route.request().postDataJSON();
        idleReturns.push(body);
        assert.equal(body.display,"idle",label+": an owner tap only returns the pet to idle");
        scene={...scene,
          sharedPets:scene.sharedPets.filter(pet=>pet.petInventoryId!=="owner-pet"),
          deposits:[{...scene.deposits[0],buildingId:null,roomEffectId:null,showInPark:false,
            parkXPct:null,parkYPct:null,pose:"idle"}]};
        return route.fulfill({json:{id:"owner-deposit",...body}});
      }
      if(path==="/api/pet-park/deposits/owner-deposit/placement"){
        const body=route.request().postDataJSON();
        saves.push(body);
        Object.assign(owned,{interiorXPct:body.xPct,interiorYPct:body.yPct,pose:body.pose});
        scene={...scene,deposits:[{...scene.deposits[0],...owned}]};
        return route.fulfill({json:{id:"owner-deposit",...body}});
      }
      return route.fulfill({json:{}});
    });
    await page.goto("http://127.0.0.1:4183/fixture",{waitUntil:"commit",timeout:30000});
    const equipped=page.getByTestId("pet-park-slot-1");
    await equipped.waitFor({state:"visible",timeout:30000});
    assert.equal(await equipped.getByTestId("pet-park-pet-portrait").count(),1,label+": equipped slot shows pet artwork");
    const bar=equipped.getByTestId("pet-park-slot-progress");
    assert.equal(await bar.count(),1,label+": equipped slot has gold next-reward progress");
    assert.equal(await bar.getAttribute("data-state"),"earning",label+": active earning status");
    const empty=page.getByTestId("pet-park-slot-2");
    assert.equal(await empty.locator("img.pet-park-slot__empty-art").count(),1,label+": open slot shows greyed mascot silhouette");
    await equipped.click();
    const rewards=page.getByRole("dialog",{name:"Park pet spot 1"});
    await rewards.waitFor({state:"visible"});
    assert.equal(await rewards.getByTestId("pet-park-reward-bars").count(),1,label+": details contain all reward meters");
    assert.equal(await rewards.getByRole("progressbar").count(),3,label+": coins, essence and XP show separately");
    const claimRequest=page.waitForResponse(response=>response.url().includes("/api/pet-park/deposits/owner-deposit/claim"));
    await rewards.getByTestId("pet-park-collect-button").click();
    await claimRequest;
    assert.deepEqual(claims,["POST"],label+": original claim action is preserved");
    await page.getByRole("button",{name:"Close pet spot"}).click();
    assert.equal(await page.getByRole("dialog",{name:"Park pet spot 1"}).count(),0);
    const houseButton=page.getByRole("button",{name:"Enter Fixture Cottage"});
    await houseButton.waitFor({state:"visible",timeout:30000});
    // The real hit-test intentionally rejects clicks before the artwork is decoded.
    await houseButton.locator("img").evaluate(img => img.decode());
    const clickInfo = await houseButton.evaluate(button => {
      const img = button.querySelector("img");
      const rect = img.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return { imgReady: img.complete, natural: [img.naturalWidth, img.naturalHeight],
        center: [x,y], buttonRect: button.getBoundingClientRect().toJSON(),
        topHit: document.elementFromPoint(x,y)?.outerHTML.slice(0,300) };
    });
    await page.evaluate(() => {
      window.__parkClickLog = [];
      document.addEventListener("click", event => {
        window.__parkClickLog.push({ target: event.target?.outerHTML.slice(0,200),
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    await houseButton.click();
    if (await page.getByTestId("pet-park-interior-room").count() === 0) {
      const debug = await page.evaluate(() => ({
        clickLog: window.__parkClickLog, scenePresent: !!document.querySelector('[data-testid="pet-park-page"]'),
        roomCount: document.querySelectorAll('[data-testid="pet-park-interior-room"]').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        excerpt: document.body.innerText.slice(-700),
      }));
      console.log("PARK CLICK DEBUG", JSON.stringify({ label, clickInfo, debug, errors }));
    }
    await page.getByTestId("pet-park-interior-room").waitFor({state:"visible"});
    const petButton=page.getByTestId("pet-park-indoor-pet-drag");
    await petButton.waitFor({state:"visible"});
    const roomSlot=page.getByTestId("pet-park-room-slot-1");
    await roomSlot.waitFor({state:"visible"});
    const slotBounds=await roomSlot.boundingBox();
    assert.ok(slotBounds && Math.abs(slotBounds.width-slotBounds.height)<2 && slotBounds.width<=69,
      label+": building tray uses a compact circular pet button");
    assert.equal(await roomSlot.getByTestId("pet-park-pet-portrait").count(),1,
      label+": the circular button renders the equipped pet's picture");
    assert.equal(await roomSlot.locator("span").filter({hasText:"My Pet"}).count(),0,
      label+": visible pet name is removed from the draggable tray");
    assert.equal(await roomSlot.getAttribute("aria-label"),"Drag My Pet into the room",
      label+": pet name is still accessible to screen readers");
    assert.equal(await page.locator("[data-park-interior-artwork] [data-park-pet]").count(),2);
    assert.equal(await page.getByTestId("pet-park-rarity-stars").count(),2);
    const art=await page.locator("[data-park-interior-artwork]").boundingBox();
    const cdp=await context.newCDPSession(page);
    async function movePet(xPct,yPct){
      const rect=await page.locator('[data-park-pet="owner-pet"]').boundingBox();
      const from={x:rect.x+rect.width/2,y:rect.y+rect.height*.50};
      const to={x:from.x+(art.x+xPct*art.width-(rect.x+rect.width/2)),
        y:from.y+(art.y+yPct*art.height-(rect.y+rect.height*.88))};
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...from,id:1}]});
      for(let step=1;step<=8;step++){const t=step/8;await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}]});}
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }
    await movePet(.58,.60);
    await page.waitForTimeout(450);
    assert.equal(saves.length,1,label+": owner can directly move an indoor resident");
    assert.ok(Math.abs(saves[0].xPct-.58)<.05 && Math.abs(saves[0].yPct-.60)<.05,label+": saved normalized room coords");
    assert.equal(saves[0].pose,"sleep",label+": sleep spot activates existing sleep mode");
    await movePet(.40,.73);
    await page.waitForTimeout(450);
    assert.equal(saves.length,2,label+": repositioning again works");
    assert.equal(saves[1].pose,"idle",label+": leaving sleep spot restores idle");

    // The equipped tray's pointer capture must still create a portrait ghost,
    // not a text-only label, while the player drags a pet into the room.
    const trayRect=await roomSlot.boundingBox();
    const fromTray={x:trayRect.x+trayRect.width/2,y:trayRect.y+trayRect.height/2};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...fromTray,id:2}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
      id:2,x:fromTray.x+16,y:fromTray.y-25}]});
    const ghost=page.getByTestId("pet-park-indoor-portrait-ghost");
    await ghost.waitFor({state:"visible"});
    assert.equal(await ghost.getByTestId("pet-park-pet-portrait").count(),1,
      label+": dragging a tray portrait carries pet artwork");
    assert.equal(await ghost.innerText(),"",label+": drag ghost has no textual pet name");
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});

    await movePet(.77,.60);
    await page.waitForTimeout(450);
    assert.equal(saves.length,2,label+": completely covering another pet is rejected");

    // Tapping one's own placed resident offers only Return to idle, not the
    // public player-profile card. This is separate from dragging the pet.
    await petButton.click();
    const returnToIdle=page.getByTestId("pet-park-own-return-idle");
    await returnToIdle.waitFor({state:"visible"});
    assert.equal(await page.getByTestId("player-detail-panel").count(),0,
      label+": tapping own pet never opens player profile");
    await returnToIdle.click();
    await page.waitForFunction(()=>!document.querySelector('[data-park-pet="owner-pet"]'));
    assert.deepEqual(idleReturns,[{display:"idle"}],label+": return is one owner-bound display request");
    assert.equal(await page.getByTestId("pet-park-room-slot-1").count(),1,
      label+": pet remains in equipped portrait tray after returning to idle");
    assert.equal(await page.getByTestId("pet-park-indoor-pet-drag").count(),0,
      label+": pet no longer occupies the building scene");
    assert.deepEqual(errors,[],label+": no browser exceptions");
    console.log("PASS "+label+": circular pet tray/ghost, resident dragging, overlap, and owner-only return-to-idle");
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
