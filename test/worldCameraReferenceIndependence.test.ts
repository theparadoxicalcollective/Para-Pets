import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateExpandedWorldCameraScale, calculateWorldFitScale, clampWorldMapOffset } from "../client/src/lib/worldViewport";

test("world camera uses viewport cover without fixed phone reference", () => {
  for (const [width, height] of [[320, 700], [360, 780], [390, 844], [412, 915], [430, 932]]) {
    for (const mapHeight of [1440, 1600, 1920, 2160]) {
      assert.equal(calculateExpandedWorldCameraScale(width, height, mapHeight),
        calculateWorldFitScale(width, height, mapHeight, false));
    }
  }
  const source = readFileSync("client/src/lib/worldViewport.ts", "utf8");
  assert.doesNotMatch(source, /WORLD_REFERENCE_CAMERA_(WIDTH|HEIGHT)/);
});

test("expanded maps preserve overscan and pannable edges without moving authored objects", () => {
  for (const [width, height] of [[683, 911], [768, 1024], [1024, 768], [1500, 844], [1920, 1080]]) {
    const mapHeight = 1440;
    const scale = calculateExpandedWorldCameraScale(width, height, mapHeight);
    assert.ok(1080 * scale >= width);
    assert.ok(mapHeight * scale >= height);
    const min = clampWorldMapOffset(-Infinity, -Infinity, scale, width, height, mapHeight);
    const max = clampWorldMapOffset(Infinity, Infinity, scale, width, height, mapHeight);
    assert.ok(min.x <= 0 && min.y <= 0);
    assert.equal(max.x, 0);
    assert.equal(max.y, 0);
    const percent = { x: 0.72, y: 0.35 };
    const screenX = min.x + 1080 * scale * percent.x;
    const screenY = min.y + mapHeight * scale * percent.y;
    assert.ok(Math.abs((screenX - min.x) / (1080 * scale) - percent.x) < 1e-12);
    assert.ok(Math.abs((screenY - min.y) / (mapHeight * scale) - percent.y) < 1e-12);
  }
});
