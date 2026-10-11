import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, clientPointInRenderedElement, usesDeviceGameplaySurface } from "../client/src/lib/stage";
import { calculateArtworkTransform, dragArtworkPercentOffset } from "../client/src/lib/artworkViewportTransform";

for (const route of ["/equip-accessories", "/equip-accessories/pet-1"]) {
  test(`${route} owns the actual viewport across device sizes and viewport offsets`, () => {
    for (const [width,height] of [[320,568],[390,844],[412,915],[834,1194],[1440,900],[667,375],[412,470]]) {
      const layout=calculateStageLayout(width,height,37,5,{fitPortraitReference:true,viewportSurface:usesDeviceGameplaySurface(route)});
      assert.equal(layout.coordinateOwner,"viewport");
      assert.equal(layout.referencePortrait,false);
      assert.equal(layout.scale,1);
      assert.equal(layout.designWidth,width);
      assert.equal(layout.designHeight,height);
      const point=clientPointInRenderedElement({left:5,top:37,width,height},width+1,height+33,width,height);
      assert.deepEqual(point,{x:width-4,y:height-4});
    }
  });
}

test("Closet drag preview uses local HUD pixels with translated or scaled bounds", () => {
  for (const scale of [.75,1,1.5]) {
    const rect={left:5,top:37,width:834*scale,height:1194*scale};
    assert.deepEqual(clientPointInRenderedElement(rect,rect.left+123*scale,rect.top+456*scale,834,1194),{x:123,y:456});
  }
});

test("Closet saved scene placement remains proportional as the preview resizes", () => {
  for (const size of [158,238,351,470]) {
    const bounds={left:23,top:100,width:size,height:size};
    const saved={x:8,y:-13,scale:1.2};
    const moved=dragArtworkPercentOffset(saved,{x:0,y:0},{x:size*.1,y:-size*.05},calculateArtworkTransform(bounds,bounds));
    assert.ok(Math.abs(moved.x-18)<1e-8);
    assert.ok(Math.abs(moved.y+18)<1e-8);
    assert.equal(moved.scale,saved.scale);
  }
});

test("Closet selects local scenery, HUD dialogs and cleaned-up touch dragging", () => {
  const read=(path:string)=>readFileSync(path,"utf8");
  const route=read("client/src/pages/EquipAccessoriesPage.tsx");
  const page=read("client/src/components/PetEquipAccessoriesPage.tsx");
  const adornments=read("client/src/components/PetCostumeEquipmentSection.tsx");
  assert.match(route,/<PetEquipAccessoriesPage\s+deviceSurface/);
  assert.match(page,/enabled: !deviceSurface/);
  assert.match(page,/\{deviceSurface \? \(/);
  assert.match(page,/\{!deviceSurface && <div data-testid="closet-authored-background"/);
  assert.match(page,/clientPointInRenderedElement\(ghostTarget.getBoundingClientRect\(\)/);
  assert.match(page,/useEffect\(\(\) => \(\) => dragCleanupRef.current\?\.\(\), \[petInventoryId\]\)/);
  for (const name of ["touchmove","touchend","touchcancel"]) assert.match(page,new RegExp(`document.removeEventListener\\("${name}"`));
  assert.match(page,/<ViewportModalPortal enabled=\{deviceSurface \?\? false\}>/);
  assert.equal((adornments.match(/<ViewportModalPortal enabled=\{deviceSurface\}>/g)??[]).length,3);
  assert.match(adornments,/position: deviceSurface \? "absolute" : "fixed"/);
  assert.match(page,/<PetPageOvalPlacement page="closet"/);
});
