import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, shouldUseDocumentLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app=readFileSync("client/src/App.tsx","utf8");
const routes=readFileSync("client/src/lib/playerPagePresentation.ts","utf8");
const viewport=readFileSync("client/src/lib/stageViewport.ts","utf8");

test("isolated admin and forum use native screen-sized UI instead of 390x844 reference plane",()=>{
  for(const route of ["/admin","/forum"]){
    assert.equal(shouldUseDocumentLayout(route,390),true,route);
    assert.equal(shouldUseDocumentLayout(route,834),true,route);
    assert.equal(usesDeviceGameplaySurface(route),false,route);
    for(const [w,h] of [[360,760],[390,844],[834,1194],[1440,900]]){
      const layout=calculateStageLayout(w,h,0,0,{viewportSurface:true,fitPortraitReference:false});
      assert.equal(layout.coordinateOwner,"viewport");
      assert.equal(layout.designWidth,w);
      assert.equal(layout.designHeight,h);
      assert.equal(layout.scale,1);
      assert.equal(layout.referencePortrait,false);
    }
  }
  assert.match(app,/if \(shouldUseDocumentLayout\(location, layout\.viewportWidth\)\)/);
  assert.match(viewport, /const viewportSurface = true/);
  assert.match(routes,/"\/admin"/);
  assert.match(routes,/"\/forum"/);
});

test("visitor home and unknown routes remain outside the native document policy",()=>{
  for(const route of ["/visit/123","/unknown-route"]){
    assert.equal(shouldUseDocumentLayout(route,834),false,route);
    assert.equal(usesDeviceGameplaySurface(route),route === "/visit/123",route);
  }
});
