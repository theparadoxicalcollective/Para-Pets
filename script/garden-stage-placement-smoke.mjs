import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// The real Admin Realm Garden panel and saved stage editor on phone/tablet.
// No production DB writes: the HTTP catalog and PATCH response are simulated.
const moduleId="/__garden-admin-stage-placement-fixture.tsx";
const fixture=[
 'import React from "react";',
 'import {createRoot} from "react-dom/client";',
 'import {QueryClient,QueryClientProvider} from "@tanstack/react-query";',
 'import {getQueryFn} from "@/lib/queryClient";',
 'import {TooltipProvider} from "@/components/ui/tooltip";',
 'import GardenAdminPanel from "@/components/GardenAdminPanel";',
 'import "@/index.css";',
 'const qc=new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"returnNull"}),retry:false,refetchOnWindowFocus:false}}});',
 'createRoot(document.getElementById("root")).render(<QueryClientProvider client={qc}><TooltipProvider><GardenAdminPanel/></TooltipProvider></QueryClientProvider>);',
].join("\n");
const server=await createServer({server:{host:"127.0.0.1",port:4192,strictPort:true},plugins:[{
  name:"garden-stage-placement-fixture",
  resolveId:id=>id===moduleId?id:null,load:id=>id===moduleId?fixture:null,
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!req.headers.accept?.includes("text/html"))return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
      '<div id="root" style="min-height:100dvh"></div>'+
      '<script type="module" src="'+moduleId+'"></script></body></html>'));
  });},
}]});
const sprite="data:image/svg+xml;base64,"+Buffer.from(
 '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="135" y="18" width="52" height="95" fill="#68a746"/></svg>',
).toString("base64");
const artCrop=(id,name,stages)=>({
  id,seedItem:{id:"seed-"+id,name,description:"",imageUrl:sprite,price:0},
  fruitItem:{id:"fruit-"+id,name:name+" Fruit",description:"",imageUrl:sprite,price:0},
  plantedImageUrl:stages.includes("planted")?sprite:null,
  seedlingImageUrl:stages.includes("seedling")?sprite:null,
  partialImageUrl:stages.includes("partial")?sprite:null,
  grownImageUrl:stages.includes("grown")?sprite:null,
  pickedImageUrl:stages.includes("picked")?sprite:null,
  plantedDrops:10,seedlingDrops:10,partialDrops:10,grownDrops:10,
  ready:false,stagePlacements:{},
});
await server.listen();
const browser=await chromium.launch({headless:true});
try {
 for(const [name,width,height] of [["phone",390,844],["tablet",834,1194]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.setDefaultTimeout(18000);
  const crops=[
    artCrop("blue","Blue Dream Seeds",["planted","seedling","partial","grown","picked"]),
    artCrop("moon","Moonflower Seeds",["seedling","grown"]),
  ];
  const requests=[],errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/admin/garden**",route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
    if(path==="/api/admin/garden" && method==="GET")
      return route.fulfill({json:{tools:[],crops}});
    const match=path.match(/^\/api\/admin\/garden\/crops\/([^/]+)\/stage-placement$/);
    if(!match || method!=="PATCH")return route.fulfill({status:404,json:{message:"unexpected admin action"}});
    const body=route.request().postDataJSON(),crop=crops.find(item=>item.id===match[1]);
    assert.ok(crop,name+": saving a known seed");
    assert.ok(["planted","seedling","partial","grown","picked"].includes(body.stage));
    assert.deepEqual(Object.keys(body).sort(),["placement","stage"]);
    crop.stagePlacements={...crop.stagePlacements,[body.stage]:body.placement};
    requests.push({cropId:match[1],...body});
    return route.fulfill({json:{stage:body.stage,placement:body.placement,stagePlacements:crop.stagePlacements}});
  });
  await page.goto("http://127.0.0.1:4192/",{waitUntil:"domcontentloaded",timeout:30000});
  await page.getByTestId("garden-adjust-plants-on-plot").waitFor({state:"visible"});
  await page.getByTestId("garden-adjust-plants-on-plot").click();
  const editor=page.getByTestId("garden-stage-placement-editor");
  await editor.waitFor({state:"visible"});
  const preview=editor.getByTestId("garden-stage-plot-preview");
  const save=editor.getByTestId("garden-save-stage-placement");
  assert.equal(await editor.getByRole("button",{name:"Select plant growth stage"}).getAttribute("aria-expanded"),"false");
  assert.equal(await editor.locator('[title="Saved placement"]').count(),0);
  const plotBox=await preview.boundingBox(),saveBox=await save.boundingBox();
  assert.ok(plotBox && saveBox && saveBox.y>plotBox.y+plotBox.height,
    name+": save stays beneath the plot editor");
  const dropdown=editor.getByTestId("garden-stage-dropdown");
  await dropdown.click();
  const choices=editor.getByTestId("garden-stage-choice");
  assert.equal(await choices.count(),7,name+": dropdown offers every uploaded stage across crops");
  await editor.getByRole("option",{name:/Blue Dream Seeds · Planted seed/}).click();

  const slider=editor.getByTestId("garden-stage-size-slider");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await editor.getByTestId("garden-stage-size-value").getByText("60%",{exact:true}).waitFor();
  const previewBounds=await preview.boundingBox();
  const start={x:previewBounds.x+previewBounds.width/2,y:previewBounds.y+previewBounds.height*.56};
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(start.x+36,start.y-24,{steps:5});
  await page.mouse.up();
  assert.equal(await save.isEnabled(),true);
  await save.click();
  await editor.locator('[title="Saved placement"]').waitFor({state:"visible"});
  assert.equal(requests.length,1);
  assert.equal(requests[0].cropId,"blue");
  assert.equal(requests[0].stage,"planted");
  assert.equal(requests[0].placement.scale,.6);
  assert.ok(Math.abs(requests[0].placement.x-.15)<.015,name+": drag X saved in units of plot width");
  assert.ok(Math.abs(requests[0].placement.y+.1)<.015,name+": drag Y saved in units of plot width");

  await dropdown.click();
  const savedChoice=editor.getByRole("option",{name:/Blue Dream Seeds · Planted seed/});
  assert.equal(await savedChoice.locator('[title="Saved placement"]').count(),1,
    name+": saved stage has a green dot in the dropdown");
  await editor.getByRole("option",{name:/Blue Dream Seeds · Seedling/}).click();
  assert.equal(await editor.locator('[title="Saved placement"]').count(),0,
    name+": unsaved seedling has no saved dot");
  await save.click();
  await editor.locator('[title="Saved placement"]').waitFor({state:"visible"});
  assert.deepEqual(Object.keys(crops[0].stagePlacements).sort(),["planted","seedling"],
    name+": stages save independently");
  await dropdown.click();
  await editor.getByRole("option",{name:/Moonflower Seeds · Fully grown/}).click();
  await save.click();
  await editor.locator('[title="Saved placement"]').waitFor({state:"visible"});
  assert.deepEqual(Object.keys(crops[1].stagePlacements),["grown"]);
  assert.equal(requests.length,3);
  assert.deepEqual(errors,[],name+": no browser runtime errors");
  console.log("PASS "+name+": editor stage menu with images, real drag and resize, below-plot save, green saved markers and independent per-crop persistence");
  await context.close();
 }
} finally {
 await browser.close();
 await server.close();
}
