import assert from "node:assert/strict";
import sharp from "sharp";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated visual regression of the REAL shared renderer: no database, scene
// editor changes, saved player data, or network images. Examine rendered RGB,
// not merely CSS/DOM structure. The same renderer is used by Home and avatar.
const fixtureId = "/__avatar-skin-tone-visual-fixture.tsx";
const bodyArt = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">' +
  '<rect x="385" y="350" width="230" height="400" rx="85" fill="#f1c4a9"/>' +
  '<ellipse cx="500" cy="390" rx="133" ry="150" fill="#f7d4b8"/>' +
  '<ellipse cx="440" cy="580" rx="45" ry="95" fill="#dba58f" opacity=".4"/>' +
  '</svg>'
).toString("base64");
const hairArt = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">' +
  '<ellipse cx="735" cy="260" rx="90" ry="95" fill="#f3d9af"/>' +
  '<ellipse cx="740" cy="255" rx="45" ry="55" fill="#fff5da" opacity=".35"/>' +
  '</svg>'
).toString("base64");
// Three equal-color shirt pieces overlap at the shoulder edges. A tint
// applied individually to alpha masks used to create visible color bands.
const fabric = (x,y,w,h) => "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">' +
  '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="#f0d5b5"/>' +
  '</svg>'
).toString("base64");
const topPieceArt = [
  fabric(455,460,100,145), fabric(530,460,60,145), fabric(420,460,60,145),
];
const bottomPieceArt = [
  fabric(470,650,70,150), fabric(525,650,70,150),
];
const fit = { xPct: 50, yPct: 50, widthPct: 100, pivotXPct: 50,
  pivotYPct: 50, rotationDeg: 0, zIndex: 80 };
const parts = ["left_leg","right_leg","left_foot","right_foot","top","left_arm","right_arm","head"]
  .map((partType, index) => ({
    ...fit, partType, imageUrl: bodyArt, zIndex: 10 + index * 10,
  }));
const fixture = [
  'import React, { useState } from "react";',
  'import {createRoot} from "react-dom/client";',
  'import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";',
  'import "@/index.css";',
  `const parts = ${JSON.stringify(parts)};`,
  `const hairArt = ${JSON.stringify(hairArt)};`,
  `const topPieceArt = ${JSON.stringify(topPieceArt)};`,
  `const bottomPieceArt = ${JSON.stringify(bottomPieceArt)};`,
  `const fit = ${JSON.stringify(fit)};`,
  'function Fixture(){',
  ' const [skin,setSkin] = useState(null);',
  ' const [hair,setHair] = useState(null);',
  ' const [hairVisible,setHairVisible] = useState(false);',
  ' const [clothesVisible,setClothesVisible] = useState(false);',
  ' const [fabricTint,setFabricTint] = useState(null);',
  ' const hairLayers = hairVisible ? [{',
  '  inventoryId:"hair-1",category:"hair",colorTint:hair,segments:[',
  '   { partType:"head",slot:"hair_front",imageUrl:hairArt,fit,renderPlane:"with_part",canvasAligned:true }',
  '  ]',
  ' }] : [];',
  ' const topSegments=topPieceArt.map((imageUrl,i)=>({',
  '  partType: ["top","right_arm","left_arm"][i],slot:"piece_"+(i+1),imageUrl,fit,renderPlane:"with_part",canvasAligned:true',
  ' }));',
  ' const bottomSegments=bottomPieceArt.map((imageUrl,i)=>({',
  '  partType: ["left_leg","right_leg"][i],slot:"piece_"+(i+1),imageUrl,fit,renderPlane:"with_part",canvasAligned:true',
  ' }));',
  ' const fabricLayers=clothesVisible ? [',
  '  {inventoryId:"shirt",category:"top",colorTint:fabricTint,segments:topSegments},',
  '  {inventoryId:"pants",category:"bottom",colorTint:fabricTint,segments:bottomSegments},',
  ' ] : [];',
  ' const clothingLayers=[...hairLayers,...fabricLayers];',
  ' return <div style={{padding:16}}>',
  '  <button data-testid="skin-original" onClick={()=>setSkin(null)}>Original</button>',
  '  <button data-testid="skin-light" onClick={()=>setSkin("#f3cfb1")}>Porcelain</button>',
  '  <button data-testid="skin-deep" onClick={()=>setSkin("#42291f")}>Rich</button>',
  '  <button data-testid="hair-show" onClick={()=>setHairVisible(true)}>Hair</button>',
  '  <button data-testid="hair-original" onClick={()=>setHair(null)}>Original hair</button>',
  '  <button data-testid="hair-deep" onClick={()=>setHair("#42291f")}>Dark hair</button>',
  '  <button data-testid="clothes-show" onClick={()=>setClothesVisible(true)}>Clothes</button>',
  '  <button data-testid="clothes-color" onClick={()=>setFabricTint("#3c5677")}>Color Clothes</button>',
  '  <div data-testid="character-swatch-frame" style={{position:"relative",width:260,height:260,background:"#152b20"}}>',
  '    <PlayerCharacterRenderer parts={parts} clothingLayers={clothingLayers} skinTone={skin} motion="static"/>',
  '  </div></div>;',
  '}',
  'createRoot(document.getElementById("root")).render(<Fixture/>);',
].join("\n");
const vite = await createServer({
  server: { host: "127.0.0.1", port: 4281, strictPort: true },
  plugins: [{
    name: "avatar-skin-tone-visual-fixture",
    resolveId: id => id === fixtureId ? id : null,
    load: id => id === fixtureId ? fixture : null,
    configureServer(server) {
      server.middlewares.use(async (req,res,next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type","text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>' +
          '<body style="margin:0;background:#152b20"><div id="root"></div>' +
          '<script type="module" src="' + fixtureId + '"></script></body></html>'));
      });
    },
  }],
});
await vite.listen();
const browser = await chromium.launch({ headless: true });
function rgbAt(raw, info, x, y) {
  const at = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [...raw.subarray(at, at + 3)];
}
const luminance = ([r,g,b]) => r * .2126 + g * .7152 + b * .0722;
try {
  for(const viewport of [
    {width:320,height:650,name:"compact phone"},
    {width:390,height:844,name:"phone"},
    {width:820,height:1180,name:"tablet"},
  ]) {
    const context = await browser.newContext({
      viewport:{width:viewport.width,height:viewport.height},isMobile:true,hasTouch:true,
      deviceScaleFactor:1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror",error=>errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto("http://127.0.0.1:4281/avatar", {waitUntil:"domcontentloaded"});
    const frame = page.getByTestId("character-swatch-frame");
    await frame.waitFor({state:"visible"});
    await page.locator('[data-character-part="head"] img').evaluate(img=>img.decode());
    async function sample(x,y){
      const png = await frame.screenshot({ animations:"disabled" });
      const {data, info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
      return rgbAt(data,info,x,y);
    }
    const original = await sample(130,135);
    await page.getByTestId("skin-light").click();
    const lightFilter = await page.getByTestId("avatar-skin-tint").evaluate(el=>getComputedStyle(el).filter);
    assert.match(lightFilter,/url\(/,viewport.name+": composited body uses a real color filter");
    const light = await sample(130,135);
    await page.getByTestId("skin-deep").click();
    const deep = await sample(130,135);
    assert.ok(luminance(deep) < luminance(light)*.54,
      viewport.name+": dark skin must be truly dark, not a pale color overlay: "+JSON.stringify({original,light,deep}));
    assert.ok(deep[0] < 120 && deep[1] < 100 && deep[2] < 90,
      viewport.name+": deep RGB channels must be below a medium skin tone: "+JSON.stringify(deep));
    assert.equal(await page.getByTestId("avatar-skin-tint").count(),1,
      viewport.name+": the entire body is tinted exactly once");
    assert.equal(await page.locator('[data-character-part] [data-testid="avatar-skin-tint"]').count(),0,
      viewport.name+": no overlapping per-part overlays are present");
    assert.equal(await page.locator('[data-character-part]').count(),8);
    await page.getByTestId("hair-show").click();
    await page.locator('[data-clothing-slot="hair_front"] img').evaluate(img=>img.decode());
    const neutralHair = await sample(194,70);
    await page.getByTestId("hair-deep").click();
    const darkHair = await sample(194,70);
    assert.ok(luminance(darkHair) < luminance(neutralHair)*.56,
      viewport.name+": hair also darkens in actual rendered pixels: "+JSON.stringify({neutralHair,darkHair}));
    assert.equal(await page.locator('[data-testid="avatar-clothing-tint"]').count(),0,
      viewport.name+": no doubled hair tint mask");

    await page.getByTestId("clothes-show").click();
    await page.locator('[data-clothing-key^="top:"] img').first().evaluate(img=>img.decode());
    assert.equal(await page.getByTestId("avatar-clothing-composite").count(),0,
      viewport.name+": original untinted clothing retains its normal layer order");
    const originalFabric = await sample(130,138);
    await page.getByTestId("clothes-color").click();
    assert.equal(await page.getByTestId("avatar-clothing-composite").count(),2,
      viewport.name+": one final tint surface for each of Top and Bottom");
    assert.equal(await page.locator('[data-clothing-key^="top:"]').count(),3);
    assert.equal(await page.locator('[data-clothing-key^="bottom:"]').count(),2);
    const allFabricPieces = await page.locator('[data-clothing-key^="top:"],[data-clothing-key^="bottom:"]')
      .evaluateAll(elements=>elements.map(el=>getComputedStyle(el).filter));
    assert.ok(allFabricPieces.every(filter=>filter==="none"),
      viewport.name+": independently moving sleeves and pants have no individual tinted filters");
    const top = await sample(130,138);
    const topShoulderOverlap = await sample(140,138);
    const bottom = await sample(130,184);
    assert.ok(luminance(top) < luminance(originalFabric)*.70,
      viewport.name+": selected fabric color darkens visible shirt pixels: "+JSON.stringify({originalFabric,top}));
    assert.ok(Math.abs(top[0]-topShoulderOverlap[0])<12 &&
      Math.abs(top[1]-topShoulderOverlap[1])<12 &&
      Math.abs(top[2]-topShoulderOverlap[2])<12,
      viewport.name+": shirt overlap has no extra tint seam: "+JSON.stringify({top,topShoulderOverlap}));
    assert.ok(luminance(bottom)<135,
      viewport.name+": bottoms receive the same deep fabric color: "+JSON.stringify(bottom));
    assert.deepEqual(errors,[],viewport.name+": no runtime page errors");
    console.log("Avatar color render:",viewport.name,{original,light,deep,neutralHair,darkHair});
    await context.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
