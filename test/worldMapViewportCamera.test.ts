import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/MapPage.tsx", "utf8");
const portal = readFileSync("client/src/components/ViewportScenePortal.tsx", "utf8");

test("World Map interactive composition uses the full-device scene camera", () => {
  assert.match(source, /import ViewportScenePortal from "@\/components\/ViewportScenePortal"/);
  const start = source.indexOf('data-testid="world-map-viewport-camera"');
  const end = source.indexOf("{showAddWorld &&", start);
  assert.ok(start >= 0 && end > start);
  const camera = source.slice(start, end);

  assert.match(source.slice(Math.max(0, start - 120), start), /<ViewportScenePortal>/);
  assert.match(camera, /className="absolute inset-0 z-10 flex flex-col"/);
  assert.match(camera, /data-testid="text-map-title"/);
  assert.match(camera, /ref=\{mapRef\}/);
  assert.match(camera, /data-quest-guide-pan-surface/);
  assert.match(camera, /worldsList\.map/);
  assert.match(camera, /left: `\$\{pos\.x\}%`/);
  assert.match(camera, /top: `\$\{pos\.y\}%`/);
  assert.match(camera, /<\/ViewportScenePortal>/);
});

test("World Map admin coordinates and quest pan surface remain percentage-owned", () => {
  assert.match(source, /origPosX: w\.posX/);
  assert.match(source, /origPosY: w\.posY/);
  assert.match(source, /const newX = Math\.max\(0, Math\.min\(85,/);
  assert.match(source, /const newY = Math\.max\(0, Math\.min\(105,/);
  assert.match(source, /data-quest-guide-pan-surface/);
});

test("ViewportScenePortal preserves native phone inline fallback", () => {
  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});
