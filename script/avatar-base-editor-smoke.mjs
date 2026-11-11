import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated admin fixture: real editor UI, no production user or database.
const fixtureId="/__avatar-base-body-fixture.tsx";
const fixture=[
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClientProvider} from "@tanstack/react-query";',
  'import {queryClient} from "@/lib/queryClient";',
  'import PlayerCharacterAdminPanel from "@/components/PlayerCharacterAdminPanel";',
  'import "@/index.css";',
  'queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});',
  'window.__avatarBodyFixtureQueryClient=queryClient;',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}>',
  '<PlayerCharacterAdminPanel />',
  '</QueryClientProvider>);',
].join("\n");
const server=await createServer({
  server:{host:"127.0.0.1",port:4297,strictPort:true},
  plugins:[{
    name:"isolated-avatar-base-editor",
    resolveId:id=>id===fixtureId?id:null,
    load:id=>id===fixtureId?fixture:null,
    configureServer(vite){
      vite.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes("text/html"))return next();
        res.setHeader("Content-Type","text/html");
        res.end(await vite.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>'+
          '<body style="margin:0;background:#0a1e14;color:#f3dfac"><div id="root" style="padding:12px"></div>'+
          '<script type="module" src="'+fixtureId+'"></script></body></html>'));
      });
    },
  }],
});
const png=Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
const partOrder=["head","top","left_arm","right_arm","left_leg","right_leg","left_foot","right_foot"];
const zIndex={head:80,top:70,left_arm:60,right_arm:50,left_leg:40,right_leg:30,left_foot:20,right_foot:10};
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const sc of [
    {name:"compact phone",width:320,height:568},
    {name:"standard phone",width:390,height:844},
    {name:"tablet",width:820,height:1180},
  ]){
    let bases=[],requests=[],failNextBody=false;
    const ctx=await browser.newContext({
      viewport:{width:sc.width,height:sc.height},isMobile:true,hasTouch:true,
    });
    const page=await ctx.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.setDefaultTimeout(18000);
    await page.route("**/api/**",async route=>{
      const url=new URL(route.request().url());
      const method=route.request().method();
      if(url.pathname==="/api/admin/player-character/bases"){
        if(method==="GET") return route.fulfill({json:bases});
        if(method==="POST"){
          const payload=route.request().postDataJSON();
          const base={id:"base-"+payload.name.toLowerCase(),name:payload.name,
            draftParts:[],publishedParts:null,isDefault:false,revision:0};
          bases=[...bases,base];requests.push({method,path:url.pathname,body:payload});
          return route.fulfill({status:201,json:base});
        }
      }
      if(method==="PUT" && url.pathname.startsWith("/api/admin/player-character/bases/") && url.pathname.endsWith("/body")){
        const body=route.request().postDataJSON();
        requests.push({method,path:url.pathname,body});
        if(failNextBody){
          failNextBody=false;
          return route.fulfill({status:409,json:{message:"This body changed elsewhere. Reload before saving."}});
        }
        const id=url.pathname.split("/")[5];
        const old=bases.find(b=>b.id===id);
        assert.ok(old,sc.name+": body save references created base");
        assert.equal(body.expectedRevision,old.revision,sc.name+": revision matches saved state");
        const next=new Map(old.draftParts.map(p=>[p.partType,p]));
        for(const part of body.parts){
          assert.ok(part.imageData.startsWith("data:image/png;base64,"));
          // Match the real processed-media URL contract. Raw anatomy names
          // contain underscores (left_arm, right_foot), which are NOT valid
          // processed asset IDs; otherwise completePlayerCharacterParts()
          // legitimately rejects the mock even though uploads succeeded.
          const imageUrl="/api/media/"+id+"-"+part.partType.replaceAll("_","-");
          assert.ok(imageUrl.startsWith("/api/media/") && /^[A-Za-z0-9-]{1,80}$/.test(imageUrl.slice(11)), "mock media IDs follow the production format");
          next.set(part.partType,{
            partType:part.partType,
            imageUrl,
            xPct:50,yPct:50,widthPct:100,
            pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:zIndex[part.partType],
          });
        }
        // Re-saving an existing body with no new artwork should correct its
        // old per-part placement without touching the stored image URLs.
        const alignedParts=[...next.values()].map(part=>({
          ...part,xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,
          rotationDeg:0,zIndex:zIndex[part.partType],
        }));
        const updated={...old,draftParts:alignedParts,revision:old.revision+1};
        bases=bases.map(b=>b.id===id?updated:b);
        return route.fulfill({json:updated});
      }
      if(url.pathname.startsWith("/api/media/"))
        return route.fulfill({body:png,contentType:"image/png"});
      if(url.pathname.startsWith("/api/"))return route.fulfill({json:[]});
      return route.continue();
    });

    await page.goto("http://127.0.0.1:4297/admin",{waitUntil:"domcontentloaded"});
    await page.getByTestId("player-character-admin-panel").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-body-fem").getAttribute("aria-pressed"),"true");
    assert.equal(await page.locator('[data-testid^="avatar-body-upload-tile-"]').count(),8,
      sc.name+": eight clearly labeled image uploads");
    assert.equal(await page.getByText("Save Selected Part").count(),0);
    assert.equal(await page.getByTestId("avatar-save-body").isDisabled(),true);
    const preview=page.getByTestId("avatar-body-preview-box");
    const originalBox=await preview.boundingBox();
    assert.ok(originalBox && originalBox.width<=Math.min(360,sc.width-24) &&
      originalBox.height<=360 && originalBox.width>=Math.min(255,sc.width-50),
      sc.name+": enlarged square preview stays inside the mobile screen");
    for(const part of partOrder){
      await page.getByTestId("avatar-upload-"+part).setInputFiles({
        name:part+".png",mimeType:"image/png",buffer:png,
      });
      await page.getByTestId("avatar-body-upload-tile-"+part).getByText("New").waitFor({state:"visible"});
    }
    assert.equal(await page.getByTestId("avatar-save-body").isEnabled(),true);
    const rendered=await page.locator('[data-character-motion-part]').evaluateAll(els=>
      els.map(el=>({part:el.getAttribute("data-character-motion-part"),
        z:Number(getComputedStyle(el).zIndex)})));
    assert.equal(rendered.length,8,sc.name+": all eight uploads appear in actual compositor");
    assert.equal(rendered[rendered.length-1].part,"head",sc.name+": head sits on top");
    const renderedCanvas=await page.getByTestId("player-character-renderer").boundingBox();
    const aligned=await page.locator('[data-character-part]').evaluateAll(els=>
      els.map(el=>{
        const r=el.getBoundingClientRect();
        return {part:el.getAttribute("data-character-part"),
          left:r.left,top:r.top,width:r.width,height:r.height};
      }));
    assert.equal(aligned.length,8);
    for(const item of aligned){
      assert.ok(Math.abs(item.left-aligned[0].left)<1 &&
        Math.abs(item.top-aligned[0].top)<1 &&
        Math.abs(item.width-aligned[0].width)<1 &&
        Math.abs(item.height-aligned[0].height)<1,
        sc.name+": "+item.part+" must share exactly the same image canvas "+
        JSON.stringify({item,reference:aligned[0]}));
      // The preview's gold border is outside the content box: compare with
      // the actual square renderer, not the border-box width (2px larger).
      assert.ok(renderedCanvas && Math.abs(item.width-renderedCanvas.width)<1,
        sc.name+": avatar layer fills the entire drawable 1000px canvas");
    }

    assert.equal(await page.getByTestId("avatar-publish-default").count(),0,
      sc.name+": the obsolete manual publish button is absent");
    const firstSaveResponse=page.waitForResponse(r=>r.url().endsWith("/body") && r.status()===200);
    await page.getByTestId("avatar-save-body").click();
    await firstSaveResponse;
    await page.getByTestId("avatar-body-upload-tile-head").getByText("New").waitFor({state:"detached"});
    assert.equal(requests.filter(x=>x.method==="POST").length,1,sc.name+": Fem created once");
    const saves=requests.filter(x=>x.method==="PUT");
    assert.equal(saves.length,1,sc.name+": eight images saved in one body request");
    assert.equal(saves[0].body.parts.length,8);
    assert.equal(bases.find(b=>b.name==="Fem")?.revision,1);
    await page.getByText("Complete body saved. Players can choose this body; no publishing step needed.").waitFor({state:"visible"});

    // Simulate an existing Fem draft saved with old anatomy sprite offsets.
    // Reopening it should show aligned artwork immediately, and Save Body
    // should migrate the draft with no need to upload every part again.
    bases=bases.map(base=>base.name==="Fem"
      ? {...base,draftParts:base.draftParts.map(part=>part.partType==="head"
        ? {...part,xPct:50,yPct:29,widthPct:42,pivotXPct:50,pivotYPct:50}
        : part)}
      : base);
    await page.evaluate(async()=>window.__avatarBodyFixtureQueryClient.invalidateQueries({
      queryKey:["/api/admin/player-character/bases"],
    }));
    await page.getByTestId("avatar-save-body").waitFor({state:"visible"});
    assert.equal(await page.getByTestId("avatar-save-body").isEnabled(),true,
      sc.name+": old misaligned saved body can be fixed without reupload");
    // Compare current boxes after the query refresh. The page may reflow
    // when the save status appears; the PRE-save box is not a stable
    // screen-coordinate reference. The renderer content is.
    const oldHead=await page.locator('[data-character-part="head"]').boundingBox();
    const currentCanvas=await page.getByTestId("player-character-renderer").boundingBox();
    assert.ok(oldHead && currentCanvas &&
      Math.abs(oldHead.x-currentCanvas.x)<1 &&
      Math.abs(oldHead.y-currentCanvas.y)<1 &&
      Math.abs(oldHead.width-currentCanvas.width)<1 &&
      Math.abs(oldHead.height-currentCanvas.height)<1,
      sc.name+": legacy saved head previews on the full current canvas before resave: "+
      JSON.stringify({oldHead,currentCanvas}));
    const alignResponse=page.waitForResponse(r=>r.url().endsWith("/body") && r.status()===200);
    await page.getByTestId("avatar-save-body").click();
    await alignResponse;
    assert.equal(requests.filter(x=>x.method==="PUT").at(-1).body.parts.length,0,
      sc.name+": Save Body aligns old draft without replacement images");
    assert.ok(bases.find(b=>b.name==="Fem")?.draftParts.every(part=>
      part.xPct===50 && part.yPct===50 && part.widthPct===100),
      sc.name+": corrected transforms persist in one draft update");

    await page.getByTestId("avatar-body-masc").click();
    assert.equal(await page.locator('[data-character-motion-part]').count(),0,
      sc.name+": Fem artwork must not leak into Masc");
    await page.getByTestId("avatar-upload-head").setInputFiles({
      name:"masc-head.png",mimeType:"image/png",buffer:png,
    });
    await page.getByTestId("avatar-body-upload-tile-head").getByText("New").waitFor({state:"visible"});
    failNextBody=true;
    const conflictResponse=page.waitForResponse(r=>r.url().endsWith("/body") && r.status()===409);
    await page.getByTestId("avatar-save-body").click();
    await conflictResponse;
    await page.waitForFunction(()=>!document.querySelector('[data-testid="avatar-save-body"]')?.hasAttribute("disabled"));
    assert.equal(bases.find(b=>b.name==="Masc")?.draftParts.length,0,
      sc.name+": conflicting save did not partially persist artwork");
    assert.equal(await page.getByTestId("avatar-body-upload-tile-head").getByText("New").count(),1,
      sc.name+": failed artwork remains available for retry");
    const retryResponse=page.waitForResponse(r=>r.url().endsWith("/body") && r.status()===200);
    await page.getByTestId("avatar-save-body").click();
    await retryResponse;
    await page.getByTestId("avatar-body-upload-tile-head").getByText("New").waitFor({state:"detached"});
    assert.equal(bases.find(b=>b.name==="Masc")?.draftParts.length,1);
    await page.getByTestId("avatar-body-fem").click();
    assert.equal(await page.locator('[data-character-motion-part]').count(),8,
      sc.name+": Fem saved artwork remains separate and reloaded");
    assert.equal(errors.length,0,sc.name+": no browser UI errors: "+errors.join("; "));
    await ctx.close();
  }
  console.log("Simple Masc/Fem avatar body editor mobile/tablet smoke passed");
}finally{
  await browser.close();
  await server.close();
}
