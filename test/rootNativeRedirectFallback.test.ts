import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, shouldUseDocumentLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const controller=readFileSync("client/src/lib/stageViewport.ts","utf8");
const app=readFileSync("client/src/App.tsx","utf8");

test("unknown route redirect cannot reintroduce a scaled portrait root",()=>{
  assert.match(controller,/const viewportSurface = true/);
  assert.doesNotMatch(controller,/shouldFitPortraitReference/);
  assert.match(controller,/\{ viewportSurface \}/);
  for(const route of ["/not-a-route","/visit","/pet-care","/reset-password"]){
    assert.equal(usesDeviceGameplaySurface(route),false);
    assert.equal(shouldUseDocumentLayout(route,390),false);
  }
  for(const [width,height] of [[360,740],[390,844],[834,1194],[1440,900]]){
    const layout=calculateStageLayout(width,height,0,0,{viewportSurface:true});
    assert.equal(layout.coordinateOwner,"viewport");
    assert.equal(layout.designWidth,width);
    assert.equal(layout.designHeight,height);
    assert.equal(layout.scale,1);
    assert.equal(layout.referencePortrait,false);
  }
  assert.match(app,/<Route><Redirect to=\{user \? "\/" : "\/auth"\} \/><\/Route>/);
});
