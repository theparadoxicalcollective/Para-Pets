import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, clientPointInRenderedElement, usesDeviceGameplaySurface } from "../client/src/lib/stage";
import { calculateArtworkTransform, dragArtworkPercentOffset } from "../client/src/lib/artworkViewportTransform";

test("standalone Level Up uses the whole unscaled viewport, including keyboard offsets", () => {
  for (const [width, height] of [[320,568], [390,844], [412,915], [834,1194], [1440,900], [412,470]]) {
    const layout = calculateStageLayout(width,height,37,5,{
      fitPortraitReference:true, viewportSurface:usesDeviceGameplaySurface("/pet-level-up/pet-1"),
    });
    assert.equal(layout.coordinateOwner,"viewport");
    assert.equal(layout.referencePortrait,false);
    assert.equal(layout.scale,1);
    assert.equal(layout.designWidth,width);
    assert.equal(layout.designHeight,height);
    const point = clientPointInRenderedElement(
      {left:layout.left,top:layout.top,width,height},
      layout.left + width * .7, layout.top + height * .6, width,height,
    );
    assert.ok(Math.abs(point.x - width * .7)<1e-8);
    assert.ok(Math.abs(point.y - height * .6)<1e-8);
  }
});

test("local drag effects follow translated and scaled page bounds", () => {
  const page = { width:834,height:1194 };
  for (const scale of [.75,1,1.5]) {
    const rect = {left:23,top:47,width:page.width*scale,height:page.height*scale};
    const point=clientPointInRenderedElement(rect,rect.left+123*scale,rect.top+456*scale,page.width,page.height);
    assert.deepEqual(point,{x:123,y:456});
  }
});

test("existing admin oval percentages and scale survive device-local scene dragging", () => {
  const saved={x:8,y:-13,scale:1.2};
  for (const size of [180,280,370,460]) {
    const bounds={left:45,top:120,width:size,height:size};
    const start={x:bounds.left+size*.5,y:bounds.top+size*.9};
    const end={x:start.x+size*.1,y:start.y-size*.05};
    const moved=dragArtworkPercentOffset(saved,
      {x:start.x-bounds.left,y:start.y-bounds.top},
      {x:end.x-bounds.left,y:end.y-bounds.top},
      calculateArtworkTransform(bounds,bounds));
    assert.ok(Math.abs(moved.x-18)<1e-8);
    assert.ok(Math.abs(moved.y+18)<1e-8);
    assert.equal(moved.scale,saved.scale);
  }
});

test("standalone route owns its background and preserves XP actions and oval", () => {
  const route=readFileSync("client/src/pages/PetLevelUpRoute.tsx","utf8");
  const page=readFileSync("client/src/components/PetLevelUpPage.tsx","utf8");
  assert.match(route, /<PetLevelUpPage\s+deviceSurface/);
  assert.match(route, /position: "absolute", inset: 0/);
  assert.match(page, /enabled: !deviceSurface/);
  assert.match(page, /\{deviceSurface \? \(/);
  assert.match(page, /\{!deviceSurface && <div data-testid="level-up-authored-background"/);
  assert.match(page, /clientPointInRenderedElement\(rect, clientX, clientY, page.clientWidth, page.clientHeight\)/);
  assert.match(page, /<PetPageOvalPlacement page="levelUp"/);
  assert.match(page, /if \(!moved \|\| dropped\) useItem\(current.item\)/);
  assert.match(route, /\/power-up/);
  assert.match(route, /\/use-special/);
});
