import assert from "node:assert/strict";
import sharp from "sharp";
import { createServer } from "vite";
import { chromium, webkit } from "playwright";

// Render the ACTUAL shared World Editor / Pet Park night mask in an isolated
// scene; compare rendered pixels, not just CSS or DOM structure. The fixture
// uses neither production data nor a live account.
const fixtureId = "/__scene-lamp-visual-fixture.tsx";
const fixture = [
  'import React, {useState} from "react";',
  'import {createRoot} from "react-dom/client";',
  'import {HomeOutdoorAtmosphereLayer} from "@/components/HomeOutdoorAtmosphere";',
  'import {parkSceneDarkness} from "@/lib/parkSceneLighting";',
  'import "@/index.css";',
  'const lamp=(id,x)=>({id,type:"lamp_light",x,y:0.5,size:8});',
  'function Fixture(){',
  ' const [mode,setMode]=useState("off");',
  ' const night=mode==="day"?0:1;',
  ' const effects=mode==="off"||mode==="day"?[]:mode==="two"?[lamp("left",0.42),lamp("right",0.58)]:[lamp("one",0.5)];',
  ' const panX=mode==="pan"?32:0;',
  ' return <><div style={{display:"flex",gap:8}}>',
  '  {["off","one","two","pan","day"].map(key=><button key={key} data-testid={"mode-"+key} onClick={()=>setMode(key)}>{key}</button>)}',
  ' </div><div data-testid="scene-lamp-fixture" data-scene-lamp-mode={mode} style={{position:"relative",width:360,height:360,background:"#91be9d",overflow:"hidden"}}>',
  ' <HomeOutdoorAtmosphereLayer parkLampFalloff darkness={parkSceneDarkness(night)} nightStrength={night} lampStrength={night}',
  '   effects={effects} panX={panX} panY={0} imgWidth={360} sceneHeight={360} transitionMs={0} zIndex={2} />',
  ' </div></>;',
  '}',
  'createRoot(document.getElementById("root")).render(<Fixture/>);',
].join("\n");

const server = await createServer({
  server: { host: "127.0.0.1", port: 4289, strictPort: true },
  plugins: [{
    name: "scene-lamp-visual-fixture",
    resolveId(id) { return id === fixtureId ? id : null; },
    load(id) { return id === fixtureId ? fixture : null; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.headers.accept?.includes("text/html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="' + fixtureId + '"></script></body></html>'));
      });
    },
  }],
});
await server.listen();

const engine = process.env.SCENE_LIGHT_BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch({ headless: true });
const point = (image, x, y) => {
  const at = (Math.round(y) * image.info.width + Math.round(x)) * image.info.channels;
  const [r,g,b] = [image.data[at], image.data[at+1], image.data[at+2]];
  return 0.2126*r + 0.7152*g + 0.0722*b;
};
try {
  for (const [name,width,height] of [
    ["compact phone", 390, 844], ["tablet", 834, 1194],
  ]) {
    const context = await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:4289/lighting-fixture", {waitUntil:"commit",timeout:30000});
    await page.getByTestId("scene-lamp-fixture").waitFor({state:"visible"});
    const take = async mode => {
      await page.getByTestId("mode-"+mode).click();
      await page.waitForFunction(expected => {
        const scene = document.querySelector('[data-testid="scene-lamp-fixture"]');
        const cutouts = scene?.querySelectorAll('[data-testid="park-outdoor-lamp-neutral-cutout"]').length ?? 0;
        const expectedCount = expected==="one"||expected==="pan" ? 1 : expected==="two" ? 2 : 0;
        return cutouts === expectedCount && scene?.getAttribute("data-scene-lamp-mode")===expected;
      },mode);
      const screenshot = await page.getByTestId("scene-lamp-fixture").screenshot({animations:"disabled"});
      return sharp(screenshot).removeAlpha().raw().toBuffer({resolveWithObject:true});
    };
    const off = await take("off");
    const one = await take("one");
    const two = await take("two");
    const pan = await take("pan");
    const day = await take("day");

    const dark = point(off, 180, 180);
    const center = point(one, 180, 180);
    const mid = point(one, 240, 180);
    const edge = point(one, 350, 180);
    const extra = point(two, 180, 180);
    const moved = point(pan, 212, 180);
    const daylight = point(day, 180, 180);
    assert.ok(center > dark + 28, name+": lamp must actually reveal nearby art through night darkness, not just paint the orb");
    assert.ok(center > mid + 10 && mid > edge + 6, name+": lamp fades gently into dark scenery");
    assert.ok(Math.abs(edge - point(off, 350, 180)) < 3, name+": lamp cannot brighten beyond its authored-size-proportional pool");
    assert.ok(extra > center + 3 && extra < daylight, name+": overlapping real lamps combine without turning into flat daytime");
    assert.ok(Math.abs(moved - center) < 4, name+": illumination stays registered to the camera pan");
    assert.ok(daylight > center + 15, name+": nighttime lights do not erase day/night contrast");
    assert.deepEqual(errors,[],name+": no JavaScript errors");
    console.log("PASS "+(process.env.SCENE_LIGHT_BROWSER||"chromium")+" "+name,
      {dark:Math.round(dark),center:Math.round(center),mid:Math.round(mid),edge:Math.round(edge),
       two:Math.round(extra),panned:Math.round(moved),day:Math.round(daylight)});
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
