import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkTerrainPreviewTransform } from "../client/src/lib/petParkTerrain";

test("cached terrain previews preserve the same point under the transformed camera", () => {
  const last = { scale: .85, panX: -250, panY: -540 };
  for (const next of [
    { scale: .7, panX: -100, panY: -280 },
    { scale: 1.6, panX: -720, panY: -1150 },
    { scale: 1.1, panX: 40, panY: -800 },
    { scale: .85, panX: -310, panY: -575 },
  ]) {
    for (const [w,h] of [[390,844],[834,1194],[1200,800]]) {
      const marginX = w*.18, marginY = h*.18;
      const { ratio, dx, dy } = parkTerrainPreviewTransform(last,next,marginX,marginY);
      for (const [worldX,worldY] of [[0,0],[500,550],[1800,2700]]) {
        // CSS transform uses the expanded canvas top-left at (-marginX,-marginY).
        const previewX = -marginX + dx + ratio*(marginX+last.panX+worldX*last.scale);
        const previewY = -marginY + dy + ratio*(marginY+last.panY+worldY*last.scale);
        assert.ok(Math.abs(previewX-(next.panX+worldX*next.scale))<1e-7);
        assert.ok(Math.abs(previewY-(next.panY+worldY*next.scale))<1e-7);
      }
    }
  }
});

test("rapid zoom reuses only its previous raster and repaints on settling", () => {
  const terrain = readFileSync("client/src/components/PetParkTerrain.tsx","utf8");
  const page = readFileSync("client/src/pages/PetParkPage.tsx","utf8");
  assert.match(terrain,/parkTerrainPreviewTransform\(/);
  assert.match(terrain,/canvas\.style\.transform =/);
  assert.match(terrain,/window\.setTimeout\(\(\) => \{/);
  assert.match(terrain,/\}, 110\)/);
  assert.match(terrain,/window\.clearTimeout\(timer\)/);
  assert.match(terrain,/window\.cancelAnimationFrame\(frame\)/);
  assert.match(terrain,/paintTerrain\(ctx, expanded\)/);
  assert.match(page,/cameraFrame\.current = window\.requestAnimationFrame/);
  assert.match(page,/parkZoomAnchorPan\(/);
  assert.match(page,/isParkPetNearViewport\(/);
});

test("paint mode is compact and does not intercept the entire scene with modal controls", () => {
  const brush = readFileSync("client/src/components/PetParkTerrainBrush.tsx","utf8");
  assert.match(brush,/data-testid="pet-park-terrain-brush-toolbar"/);
  assert.match(brush,/aria-expanded=\{showOptions\}/);
  assert.match(brush,/data-testid="pet-park-terrain-brush-palette"/);
  assert.match(brush,/setShowOptions\(false\)/);
  assert.match(brush,/onPointerUp=\{finish\}/);
  assert.match(brush,/void saveStroke\(completed\)/);
  assert.doesNotMatch(brush,/max-h-\[47dvh\]/);
});
