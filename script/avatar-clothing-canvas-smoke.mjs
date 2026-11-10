import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated admin fixture: real clothing UI and shared renderer, stubbed
// authenticated JSON endpoints. Nothing writes to production.
const fixtureId="/__clothing-canvas-fixture.tsx";
const fixture=[
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {QueryClientProvider} from "@tanstack/react-query";',
  'import {queryClient} from "@/lib/queryClient";',
  'import PlayerClothingAdminPanel from "@/components/PlayerClothingAdminPanel";',
  'import "@/index.css";',
  'queryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,retry:false,refetchOnWindowFocus:false}});',
  'createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}>',
  '<PlayerClothingAdminPanel />',
  '</QueryClientProvider>);',
].join("\n");
const server=await createServer({
  server:{host:"127.0.0.1",port:4299,strictPort:true},
  plugins:[{
    name:"isolated-clothing-canvas-fixture",
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
const partTypes=["head","top","left_arm","right_arm","left_leg","right_leg","left_foot","right_foot"];
const zIndex={head:80,top:70,left_arm:60,right_arm:50,left_leg:40,right_leg:30,left_foot:20,right_foot:10};
const fit={xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:1};
const baseId="00000000-0000-4000-8000-000000000001";
const publishedAt="2026-11-10T12:00:00.000Z";
const mediaId=n=>"/api/media/00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const base={
  id:baseId,name:"Fem",publishedAt,
  publishedParts:partTypes.map((partType,index)=>({
    partType,imageUrl:mediaId(index+1),
    xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,
    rotationDeg:0,zIndex:zIndex[partType],
  })),
};
const slotTarget=slot=>
  ["hair_front","hair_back","face_open_eyes","face_closed_eyes","face_mouth"].includes(slot)
    ? "head":slot;
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  for(const sc of [
    {name:"compact phone",width:320,height:568},
    {name:"phone",width:390,height:844},
    {name:"tablet",width:820,height:1180},
  ]){
    let drafts=[],calls=[],nextMedia=50;
    const ctx=await browser.newContext({viewport:{width:sc.width,height:sc.height},
      isMobile:true,hasTouch:true});
    const page=await ctx.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.setDefaultTimeout(20000);
    await page.route("**/api/**",async route=>{
      const url=new URL(route.request().url());
      const method=route.request().method(),path=url.pathname;
      if(path==="/api/admin/player-character/bases" && method==="GET")
        return route.fulfill({json:[base]});
      if(path==="/api/admin/player-character/clothing" && method==="GET")
        return route.fulfill({json:drafts});
      if(path==="/api/admin/player-character/clothing" && method==="POST"){
        const body=route.request().postDataJSON();
        const row={id:"00000000-0000-4000-8000-"+String(drafts.length+2).padStart(12,"0"),
          baseId,basePublishedAt:publishedAt,name:body.name,category:body.category,
          draftSegments:[],publishedSegments:null,shopItemId:null,revision:0};
        drafts=[...drafts,row];calls.push({method,path,body});
        return route.fulfill({status:201,json:row});
      }
      const item=drafts.find(x=>path.includes("/"+x.id+"/"));
      if(item && method==="PUT" && path.endsWith("/artwork")){
        const body=route.request().postDataJSON();
        calls.push({method,path,body});
        assert.equal(body.expectedRevision,item.revision,sc.name+": revision match");
        const bySlot=new Map(item.draftSegments.map(x=>[x.slot??x.partType,x]));
        for(const slot of body.removeSlots??[])bySlot.delete(slot);
        for(const img of body.images){
          assert.ok(img.imageData.startsWith("data:image/png;base64,"));
          bySlot.set(img.slot,{slot:img.slot,partType:slotTarget(img.slot),
            canvasAligned:true,fit:{...fit},renderPlane:"with_part",
            imageUrl:mediaId(nextMedia++)});
        }
        const row={...item,draftSegments:[...bySlot.values()],revision:item.revision+1};
        drafts=drafts.map(x=>x.id===item.id?row:x);
        return route.fulfill({json:row});
      }
      if(item && method==="POST" && path.endsWith("/save")){
        const body=route.request().postDataJSON();
        calls.push({method,path,body});
        assert.equal(body.expectedRevision,item.revision);
        const row={...item,publishedSegments:item.draftSegments,
          shopItemId:mediaId(nextMedia++),revision:item.revision+1};
        drafts=drafts.map(x=>x.id===item.id?row:x);
        return route.fulfill({json:row});
      }
      if(path.startsWith("/api/media/"))
        return route.fulfill({body:png,contentType:"image/png"});
      if(path.startsWith("/api/"))return route.fulfill({json:[]});
      return route.continue();
    });
    await page.goto("http://127.0.0.1:4299/admin",{waitUntil:"domcontentloaded"});
    await page.getByTestId("player-clothing-admin-panel").waitFor({state:"visible"});

    async function create(name,category){
      await page.getByLabel("New clothing name").fill(name);
      await page.getByLabel("Category",{exact:true}).selectOption(category);
      const response=page.waitForResponse(r=>r.url().endsWith("/api/admin/player-character/clothing")
        && r.request().method()==="POST");
      await page.getByTestId("avatar-create-clothing").click();
      await response;
      await page.getByTestId("avatar-clothing-fit-canvas").waitFor({state:"visible"});
    }
    async function upload(slot){
      await page.getByTestId("avatar-clothing-upload-"+slot).setInputFiles({
        name:slot+".png",mimeType:"image/png",buffer:png,
      });
      await page.getByTestId("clothing-part-"+slot).getByText("New").waitFor({state:"visible"});
    }
    async function checkCanvas(slots,category){
      const frame=await page.getByTestId("player-character-renderer").boundingBox();
      assert.ok(frame && frame.width<=sc.width-24 && frame.width>200,
        sc.name+": full square preview fits viewport");
      const layers=await page.locator('[data-clothing-slot]').evaluateAll(elements=>
        elements.map(el=>{
          const r=el.getBoundingClientRect();
          const img=el.querySelector("img");
          return {slot:el.getAttribute("data-clothing-slot"),
            part:el.getAttribute("data-clothing-part"),
            z:getComputedStyle(el).zIndex,
            x:r.x,y:r.y,width:r.width,height:r.height,
            imgWidth:img?.getBoundingClientRect().width,
            imgHeight:img?.getBoundingClientRect().height};
        }));
      assert.deepEqual(layers.map(x=>x.slot).sort(),[...slots].sort(),
        sc.name+": correct "+category+" layer slots");
      for(const layer of layers){
        assert.ok(Math.abs(layer.x-frame.x)<=1 &&
          Math.abs(layer.y-frame.y)<=1 &&
          Math.abs(layer.width-frame.width)<=1 &&
          Math.abs(layer.height-frame.height)<=1 &&
          Math.abs(layer.imgWidth-frame.width)<=1 &&
          Math.abs(layer.imgHeight-frame.height)<=1,
          sc.name+": "+layer.slot+" must fill the one common canvas: "+JSON.stringify(layer));
      }
      return layers;
    }
    async function save(count){
      const response=page.waitForResponse(r=>r.url().endsWith("/artwork")
        && r.request().method()==="PUT" && r.status()===200);
      await page.getByTestId("avatar-save-clothing-artwork").click();
      await response;
      const last=calls.filter(x=>x.method==="PUT").at(-1);
      assert.equal(last.body.images.length,count,sc.name+": save all clothing images once");
      if(last.body.images.length){
        await page.getByTestId("clothing-part-"+last.body.images[0].slot)
          .getByText("New").waitFor({state:"detached"});
      }
      for(const part of drafts.at(-1).draftSegments){
        assert.deepEqual(part.fit,fit);
        assert.equal(part.canvasAligned,true);
      }
    }

    await create("Three-Part Blouse","top");
    for(const slot of ["top","left_arm","right_arm"])await upload(slot);
    await checkCanvas(["top","left_arm","right_arm"],"top");
    await save(3);
    assert.equal(drafts.at(-1).draftSegments.length,3);
    const publish=page.waitForResponse(r=>r.url().endsWith("/save") && r.status()===200);
    await page.getByTestId("avatar-publish-clothing").click();
    await publish;
    assert.equal(drafts.at(-1).publishedSegments.length,3);

    await create("Expressions","face");
    for(const slot of ["face_open_eyes","face_closed_eyes","face_mouth"])await upload(slot);
    const face=await checkCanvas(["face_open_eyes","face_closed_eyes","face_mouth"],"face");
    assert.ok(face.every(x=>x.part==="head"),sc.name+": all face images follow the head");
    const eyes=async()=>page.evaluate(()=>{
      const open=document.querySelector(".player-character-renderer__eyes-open");
      const closed=document.querySelector(".player-character-renderer__eyes-closed");
      return {open:getComputedStyle(open).opacity,closed:getComputedStyle(closed).opacity};
    });
    assert.deepEqual(await eyes(),{open:"1",closed:"0"});
    await page.getByRole("button",{name:"Closed Eyes"}).click();
    assert.deepEqual(await eyes(),{open:"0",closed:"1"},
      sc.name+": closed eyes preview replaces, not overlays, open eyes");
    await page.getByRole("button",{name:"Open Eyes"}).click();
    await save(3);
    assert.equal(drafts.at(-1).draftSegments.length,3);

    await create("Two-Layer Hair","hair");
    await upload("hair_front");await upload("hair_back");
    const hair=await checkCanvas(["hair_front","hair_back"],"hair");
    assert.ok(Number(hair.find(x=>x.slot==="hair_back").z) <
      Number(hair.find(x=>x.slot==="hair_front").z),
      sc.name+": hair back renders behind hair front");
    await save(2);
    assert.equal(drafts.at(-1).draftSegments.length,2);
    assert.equal(errors.length,0,sc.name+": browser errors: "+errors.join("; "));
    await ctx.close();
    console.log("PASS "+sc.name+": three-piece top, face expressions and hair layers align on one canvas");
  }
}finally{
  await browser.close();
  await server.close();
}
