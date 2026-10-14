import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, shouldUseDocumentLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app=readFileSync("client/src/App.tsx","utf8");
const visitor=readFileSync("client/src/pages/VisitPetHousePage.tsx","utf8");
const viewport=readFileSync("client/src/lib/stageViewport.ts","utf8");

test("visitor home uses native device viewport without a scaled 390x844 root",()=>{
  for(const route of ["/visit/123","/visit/another-user"]){
    assert.equal(usesDeviceGameplaySurface(route),true);
    assert.equal(shouldUseDocumentLayout(route,390),false);
    for(const [width,height] of [[360,760],[390,844],[834,1194],[1440,900]]){
      const layout=calculateStageLayout(width,height,0,0,{viewportSurface:true,fitPortraitReference:false});
      assert.equal(layout.coordinateOwner,"viewport");
      assert.equal(layout.designWidth,width);
      assert.equal(layout.designHeight,height);
      assert.equal(layout.scale,1);
      assert.equal(layout.referencePortrait,false);
    }
  }
  assert.equal(usesDeviceGameplaySurface("/visit"),false);
  assert.equal(usesDeviceGameplaySurface("/visit/123/extra"),false);
  assert.match(viewport,/usesDeviceGameplaySurface\(pathname\)/);
  assert.match(app,/<Route path="\/visit\/:userId">/);
  assert.match(app,/if \(usesDeviceGameplaySurface\(location\)\)/);
});

test("visitor house retains existing scene camera, authored positions and HUD",()=>{
  assert.match(visitor, /<ViewportScenePortal/);
  assert.match(visitor, /<ViewportHudPortal/);
  assert.match(visitor, /observeHomeViewport\(container, recalc, "artwork-scene"\)/);
  assert.match(visitor, /centeredHomeCameraPanX\(/);
  assert.match(visitor, /clampHomeCameraPanX\(/);
  assert.match(visitor, /homeCameraPointerDeltaX\(/);
  assert.match(visitor, /item\.xPct \* imgWidth/);
  assert.match(visitor, /item\.yPct \* containerH/);
  assert.match(visitor, /clampPetHousePlayerScale\(/);
  assert.match(app,/id="game-viewport-hud"/);
});
