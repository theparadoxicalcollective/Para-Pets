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
const zIndex={head:50,top:30,left_arm:35,right_arm:36,left_leg:10,right_leg:11,left_foot:15,right_foot:16};
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
      if(method==="PUT" && /\\/api\\/admin\\/player-character\\/bases\\/[^/]+\\/body$/.test(url.pathname)){
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
          assert.match(part.imageData,/^data:image\\/png;base64,/);
          const defaults={
            head:[50,29,42],top:[50,58,50],left_arm:[28,48,21],
            right_arm:[72,48,21],left_leg:[42,72,24],
            right_leg:[58,72,24],left_foot:[42,88,24],right_foot:[58,88,24],
          }[part.partType];
          next.set(part.partType,{
            partType:part.partType,
            imageUrl:"/api/media/"+id+"-"+part.partType,
            xPct:defaults[0],yPct:defaults[1],widthPct:defaults[2],
            pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:zIndex[part.partType],
          });
        }
        const updated={...old,draftParts:[...next.values()],revision:old.revision+1};
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
    assert.ok(originalBox && originalBox.width<=sc.width-24 && originalBox.height<=270,
      sc.name+": preview fits the mobile screen");
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
    assert.equal(await page.getByTestId("avatar-publish-default").count(),0,
      sc.name+": incomplete unsaved body cannot publish");
    await page.getByTestId("avatar-save-body").click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="avatar-save-body"]')?.hasAttribute("disabled"));
    assert.equal(requests.filter(x=>x.method==="POST").length,1,sc.name+": Fem created once");
    const saves=requests.filter(x=>x.method==="PUT");
    assert.equal(saves.length,1,sc.name+": eight images saved in one body request");
    assert.equal(saves[0].body.parts.length,8);
    assert.equal(bases.find(b=>b.name==="Fem")?.revision,1);
    await page.getByTestId("avatar-publish-default").waitFor({state:"visible"});

    await page.getByTestId("avatar-body-masc").click();
    assert.equal(await page.locator('[data-character-motion-part]').count(),0,
      sc.name+": Fem artwork must not leak into Masc");
    await page.getByTestId("avatar-upload-head").setInputFiles({
      name:"masc-head.png",mimeType:"image/png",buffer:png,
    });
    await page.getByTestId("avatar-body-upload-tile-head").getByText("New").waitFor({state:"visible"});
    failNextBody=true;
    await page.getByTestId("avatar-save-body").click();
    await page.waitForFunction(()=>!document.querySelector('[data-testid="avatar-save-body"]')?.hasAttribute("disabled"));
    assert.equal(bases.find(b=>b.name==="Masc")?.draftParts.length,0,
      sc.name+": conflicting save did not partially persist artwork");
    assert.equal(await page.getByTestId("avatar-body-upload-tile-head").getByText("New").count(),1,
      sc.name+": failed artwork remains available for retry");
    await page.getByTestId("avatar-save-body").click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="avatar-save-body"]')?.hasAttribute("disabled"));
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
