import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/pages/MapPage.tsx", "utf8");

test("world map background scrolls with its admin-authored nodes", () => {
  const camera = source.indexOf('data-testid="world-map-viewport-camera"');
  const scroll = source.indexOf('overflow-auto map-scroll', camera);
  const surface = source.indexOf('ref={mapRef}', scroll);
  const artwork = source.indexOf('backgroundImage: `url(${mapBgData?.bgUrl || worldMapBg})`', surface);
  const nodes = source.indexOf('className="absolute inset-0"', surface);
  assert.ok(camera >= 0 && scroll > camera && surface > scroll);
  assert.ok(artwork > surface && nodes > artwork);
  assert.doesNotMatch(source.slice(camera, scroll), /backgroundImage:/);
  assert.match(source.slice(surface, nodes), /backgroundSize: "100% 100%"/);
  assert.match(source.slice(surface, nodes), /aspectRatio: "1 \/ 2\.05"/);
  assert.doesNotMatch(source.slice(surface, nodes), /minHeight: "100%"/);
  assert.match(source.slice(surface, nodes), /var\(--viewport-height\)/);
  assert.doesNotMatch(source.slice(surface, nodes), /100dvh/);
  assert.doesNotMatch(source.slice(camera, scroll), /paddingTop: "env\(safe-area-inset-top/);
  assert.doesNotMatch(source.slice(surface, nodes), /paddingBottom: "115%"/);
  assert.match(source.slice(scroll, surface), /touchAction: "pan-x pan-y"/);
});

test("admin placements and scene-relative dragging remain unchanged", () => {
  assert.match(source, /dragScenePercentage\(/);
  assert.match(source, /left: `\$\{raidDragPos\?\.x \?\? raidIconPos\.posX\}%`/);
  assert.match(source, /top: `\$\{raidDragPos\?\.y \?\? raidIconPos\.posY\}%`/);
  assert.match(source, /data-quest-guide-pan-surface/);
});
