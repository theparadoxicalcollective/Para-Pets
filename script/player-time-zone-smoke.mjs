import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

// Isolated, real React component + clock behavior; no real account writes.
const moduleId="/__player-time-zone-smoke-fixture.tsx";
const fixture=[
  'import React,{useState} from "react";',
  'import {createRoot} from "react-dom/client";',
  'import PlayerTimeZoneSelect from "@/components/PlayerTimeZoneSelect";',
  'import {isNightInteriorArtworkActive} from "@/lib/homeOutdoorLighting";',
  'function Fixture(){',
  ' const [signup,setSignup]=useState("America/New_York");',
  ' const [profile,setProfile]=useState("America/New_York");',
  ' const when=new Date("2026-11-12T11:00:00Z");',
  ' return <main style={{padding:20,background:"#0e291c",minHeight:"100dvh",color:"#f9dea9"}}>',
  ' <PlayerTimeZoneSelect id="signup-zone" testId="register-time-zone" value={signup} onChange={setSignup}/>',
  ' <PlayerTimeZoneSelect id="profile-zone" testId="profile-time-zone" value={profile} onChange={setProfile}/>',
  ' <p data-testid="signup-visual-clock">{isNightInteriorArtworkActive("auto",when,signup)?"night":"day"}</p>',
  ' <p data-testid="profile-visual-clock">{isNightInteriorArtworkActive("auto",when,profile)?"night":"day"}</p>',
  ' </main>;',
  '}',
  'createRoot(document.getElementById("root")).render(<Fixture/>);',
].join("\n");
const server=await createServer({
  server:{host:"127.0.0.1",port:4221,strictPort:true},
  plugins:[{
    name:"player-time-zone-smoke",
    resolveId:id=>id===moduleId?id:null,
    load:id=>id===moduleId?fixture:null,
    configureServer(vite){
      vite.middlewares.use(async(req,res,next)=>{
        if(!req.headers.accept?.includes("text/html"))return next();
        res.setHeader("Content-Type","text/html");
        res.end(await vite.transformIndexHtml(req.url,
          '<html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body style="margin:0">'+
          '<div id="root"></div><script type="module" src="'+moduleId+'"></script></body></html>'));
      });
    },
  }],
});
await server.listen();
const browser=await chromium.launch({headless:true});
try {
  for(const size of [{name:"compact phone",width:320,height:568},
    {name:"phone",width:390,height:844},{name:"tablet",width:834,height:1194}]) {
    const context=await browser.newContext({viewport:{width:size.width,height:size.height},
      isMobile:true,hasTouch:true});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.goto("http://127.0.0.1:4221/time-zone",{waitUntil:"domcontentloaded"});
    const signup=page.getByTestId("register-time-zone");
    const profile=page.getByTestId("profile-time-zone");
    await signup.waitFor({state:"visible"});
    assert.equal(await signup.inputValue(),"America/New_York");
    assert.equal(await page.getByTestId("signup-visual-clock").innerText(),"day");
    assert.equal(await page.getByTestId("profile-visual-clock").innerText(),"day");
    await signup.selectOption("America/Los_Angeles");
    assert.equal(await page.getByTestId("signup-visual-clock").innerText(),"night",
      size.name+": west-coast 3 AM still uses night art");
    assert.equal(await page.getByTestId("profile-visual-clock").innerText(),"day",
      size.name+": time-zone changes are isolated to the chosen control");
    await profile.selectOption("America/Los_Angeles");
    assert.equal(await page.getByTestId("profile-visual-clock").innerText(),"night",
      size.name+": profile dropdown updates the scene clock");
    await profile.selectOption("America/New_York");
    assert.equal(await page.getByTestId("profile-visual-clock").innerText(),"day",
      size.name+": selecting 6 AM restores day art");
    const fit=await signup.evaluate(el=>{const r=el.getBoundingClientRect();
      return r.left>=0&&r.right<=innerWidth+1&&r.height>=40;});
    assert.ok(fit,size.name+": native time-zone picker is reachable on touch viewport");
    assert.deepEqual(errors,[],size.name+": no React runtime exceptions");
    console.log("PASS "+size.name+": IANA dropdown and automatic 6 AM room art");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
