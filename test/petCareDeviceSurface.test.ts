import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, clientPointInRenderedElement, usesDeviceGameplaySurface } from "../client/src/lib/stage";
import { pointInsideExpandedPetDropZone } from "../client/src/lib/petCareInteractions";

test("Pet Care owns the usable viewport without a reference plane at every device size", () => {
  for (const [width,height] of [[320,568],[390,844],[412,915],[834,1194],[1440,900],[667,375],[412,470]]) {
    const layout=calculateStageLayout(width,height,37,5,{fitPortraitReference:true,viewportSurface:usesDeviceGameplaySurface("/pet-care/pet-1")});
    assert.equal(layout.coordinateOwner,"viewport");
    assert.equal(layout.referencePortrait,false);
    assert.equal(layout.scale,1);
    assert.equal(layout.designWidth,width);
    assert.equal(layout.designHeight,height);
    const bounds={left:layout.left,top:layout.top,width,height};
    const point=clientPointInRenderedElement(bounds,bounds.left+width*.6,bounds.top+height*.4,width,height);
    assert.ok(Math.abs(point.x-width*.6)<1e-8);
    assert.ok(Math.abs(point.y-height*.4)<1e-8);
  }
});

test("drag and feedback coordinates match local rendered bounds after translation or scale", () => {
  for (const scale of [.75,1,1.5]) {
    const bounds={left:23,top:57,width:834*scale,height:1194*scale};
    assert.deepEqual(clientPointInRenderedElement(bounds,bounds.left+123*scale,bounds.top+456*scale,834,1194),{x:123,y:456});
  }
});

test("client-space feeding targets remain valid after viewport and pet bounds move", () => {
  for (const [left,top,size] of [[23,57,112],[120,80,218],[300,240,390]]) {
    const pet={left,top,right:left+size,bottom:top+size,width:size,height:size};
    assert.equal(pointInsideExpandedPetDropZone({x:left+size/2,y:top+size/2},pet),true);
    assert.equal(pointInsideExpandedPetDropZone({x:left-100,y:top-100},pet),false);
  }
});

test("standalone care effects and dialogs explicitly own device coordinates", () => {
  const read=(path:string)=>readFileSync(path,"utf8");
  const page=read("client/src/pages/PetCarePage.tsx");
  const overlay=read("client/src/features/pet-care/FeedingOverlay.tsx");
  const css=read("client/src/petCarePolish.css");
  assert.match(page,/<FeedingOverlay\s+deviceSurface/);
  assert.match(overlay,/const viewportCareSurface = \(\) => deviceSurface\s+\? overlayRef.current/);
  assert.match(overlay,/enabled: !deviceSurface/);
  assert.match(overlay,/\{!deviceSurface && <ViewportScenePortal/);
  assert.match(overlay,/position=\{deviceSurface \? "absolute" : "fixed"\}/);
  assert.match(overlay,/position: "fixed"/);
  assert.equal((overlay.match(/<ViewportModalPortal enabled=\{deviceSurface\}>/g)??[]).length,2);
  assert.match(overlay,/data-stage-coordinate-space=\{deviceSurface \|\| viewportCareSurface\(\) \? "viewport" : "canonical"\}/);
  assert.match(css,/@container \(max-height: 650px\)/);
  assert.match(css,/max-height: 40cqh;\s+overflow-y: auto/);
  assert.match(overlay,/onLostPointerCapture=\{dragEnabled \? onItemPointerCancel : undefined\}/);
});
