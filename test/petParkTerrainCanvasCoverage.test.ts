import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkTerrainPreviewCoversViewport, parkTerrainPreviewTransform } from "../client/src/lib/petParkTerrain";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";

test("cached terrain raster must always cover the viewport while being transformed", () => {
  const width = 390, height = 844;
  const marginX = width * .18, marginY = height * .18;
  const last = { panX: -700, panY: -1100, scale: 1 };
  assert.equal(parkTerrainPreviewCoversViewport(last, last, width, height, marginX, marginY), true);
  for (const dx of [-28, 28]) {
    const moved = { ...last, panX: last.panX + dx };
    assert.equal(parkTerrainPreviewCoversViewport(last, moved, width, height, marginX, marginY), true);
  }
  for (const dx of [-220, 220]) {
    const moved = { ...last, panX: last.panX + dx };
    assert.equal(parkTerrainPreviewCoversViewport(last, moved, width, height, marginX, marginY), false,
      "fast swipes must demand a repaint instead of exposing a flat dark rectangle");
  }
  assert.equal(parkTerrainPreviewCoversViewport(last, { ...last, panY: -1350 }, width, height, marginX, marginY), false);
  assert.equal(parkTerrainPreviewCoversViewport(last, { ...last, scale: .65 }, width, height, marginX, marginY), false,
    "zooming out may shrink the old raster until the screen is uncovered");
});

test("coverage guard matches the actual CSS translation/scale in many camera geometries", () => {
  for (const [width,height] of [[320,568],[390,844],[834,1194],[1024,1366]]) {
    for (const groundLevel of [1,2,4]) {
      const g = parkCameraGeometry(width,height,groundLevel,1);
      const old = parkClampCamera({ x: -g.limitX*.5, y: -g.limitY*.5 },g);
      const last = { panX: old.x, panY: old.y, scale:g.scale };
      const marginX = width*.18,marginY=height*.18;
      for (const xOffset of [-350,-50,0,50,350]) {
        for(const zoomRatio of [.72,1,1.28]) {
          const next = { ...last, panX:last.panX+xOffset, scale:last.scale*zoomRatio };
          const expected=parkTerrainPreviewTransform(last,next,marginX,marginY);
          const left=-marginX+expected.dx,top=-marginY+expected.dy;
          const right=left+(width+marginX*2)*expected.ratio;
          const bottom=top+(height+marginY*2)*expected.ratio;
          const covers=left<=-1 && top<=-1 && right>=width+1 && bottom>=height+1;
          assert.equal(parkTerrainPreviewCoversViewport(last,next,width,height,marginX,marginY),covers);
        }
      }
    }
  }
});

test("terrain reuses the same camera, repaints uncovered raster immediately, and retains idle debounce", () => {
  const painter=readFileSync("client/src/components/PetParkTerrain.tsx","utf8");
  const page=readFileSync("client/src/pages/PetParkPage.tsx","utf8");
  assert.match(painter,/parkTerrainPreviewCoversViewport\(previous\.view, view,/);
  assert.match(painter,/\)\) \{\s*\/\/[\s\S]*?paint\(\);/);
  assert.match(painter,/timer = window\.setTimeout\(\(\) =>/);
  assert.match(painter,/ctx\.setTransform\(ratio, 0, 0, ratio, 0, 0\)/);
  assert.match(page,/<PetParkTerrain/);
  assert.match(page,/queueCameraUpdate\(parkClampCamera/);
  assert.doesNotMatch(painter,/document\.createElement\(["']canvas/);
});
