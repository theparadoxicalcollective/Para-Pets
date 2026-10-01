import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("shared world viewport controller owns frame measurement and pan lifecycle", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /window\.addEventListener\("orientationchange", measure\)/);
  assert.match(source, /getStageScale\(\)/);
  assert.match(source, /WORLD_MAP_PAN_THRESHOLD_PX = 4/);
  assert.match(source, /WORLD_MAP_POST_PAN_CLICK_MS = 80/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /addEventListener\("wheel", handleVpWheel, \{ passive: false \}\)/);
});

test("viewport controller preserves no-blank-space fit and clamp ownership", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(source, /calculateWorldFitScale\(/);
  assert.match(source, /clampWorldMapOffset\(/);
  assert.match(source, /mapHRef\.current,[\s\S]*?mapWidth/);
  assert.match(source, /const initialX = \(frameWRef\.current - mapWidth \* fitScale\) \/ 2/);
  assert.match(source, /const initialY = \(frameHRef\.current - mapHRef\.current \* fitScale\) \/ 2/);
});

test("world background loading state remains owned by WorldPage", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");
  const controller = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(worldPage, /const \[worldBgLoaded, setWorldBgLoaded\] = useState\(false\)/);
  assert.match(worldPage, /const \[committedWorldBg, setCommittedWorldBg\] = useState<string>\(""\"?\)/);
  assert.match(worldPage, /const lastLoadedBgRef = useRef\(""\"?\)/);

  assert.doesNotMatch(controller, /worldBgLoaded|committedWorldBg|lastLoadedBgRef/);
});

test("world background loading state remains owned by WorldPage", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");
  const controller = read("client/src/worlds/useWorldViewportController.ts");

  assert.ok(worldPage.includes("const [worldBgLoaded, setWorldBgLoaded] = useState(false);"));
  assert.ok(worldPage.includes('const [committedWorldBg, setCommittedWorldBg] = useState<string>("");'));
  assert.ok(worldPage.includes('const lastLoadedBgRef = useRef("");'));

  assert.doesNotMatch(controller, /worldBgLoaded|committedWorldBg|lastLoadedBgRef/);
});

test("viewport controller pauses map panning during admin location or object drags", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(
    source,
    /if \(isLocationDragActive\(\) && !mapPanPointersRef\.current\.size\) \{[\s\S]*?clearStaleLocationDrag\(\)/,
  );
  assert.match(
    source,
    /if \(isLocationDragActive\(\) \|\| isObjectDragActive\(\)\) return;/,
  );

  const guards = source.match(
    /if \(isLocationDragActive\(\) \|\| isObjectDragActive\(\)\) return;/g,
  ) ?? [];
  assert.equal(guards.length, 2);
});

test("world changes reset map height through the shared controller", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*?mapHRef\.current = defaultMapHeight;[\s\S]*?setMapH\(defaultMapHeight\);[\s\S]*?\}, \[defaultMapHeight, worldId\]\)/,
  );
  assert.match(
    source,
    /const setAuthoredMapHeight = useCallback\(\(height: number\) => \{[\s\S]*?mapHRef\.current = height;[\s\S]*?setMapH\(height\)/,
  );
});

test("WorldPage delegates viewport state and pointer handlers to the shared controller", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /import \{ useWorldViewportController \} from "@\/worlds\/useWorldViewportController"/,
  );
  assert.match(
    worldPage,
    /\} = useWorldViewportController\(\{[\s\S]*?worldId,[\s\S]*?mapWidth: MAP_W,[\s\S]*?defaultMapHeight: MAP_H_DEFAULT/,
  );
  assert.match(worldPage, /ref=\{vpRef\}/);
  assert.match(worldPage, /onPointerDown=\{handleVpPointerDown\}/);
  assert.match(worldPage, /onPointerMove=\{handleVpPointerMove\}/);
  assert.match(worldPage, /onPointerUp=\{handleVpPointerUp\}/);
  assert.match(worldPage, /onPointerCancel=\{handleVpPointerUp\}/);

  assert.doesNotMatch(worldPage, /const mapPanPointersRef/);
  assert.doesNotMatch(worldPage, /const handleVpPointerDown = useCallback/);
  assert.doesNotMatch(worldPage, /new ResizeObserver\(measure\)/);
  assert.doesNotMatch(worldPage, /clampWorldMapOffset\(/);
});

test("Janson fishing guidance still uses the public viewport transform API", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /if \(!showFishHint \|\| worldId !== ELYSIAN_BAYOU_WORLD_ID\) return;/,
  );
  assert.match(worldPage, /const scale = mapTransformRef\.current\.scale/);
  assert.match(
    worldPage,
    /applyMapTransform\(frameW \/ 2 - centerX \* scale, frameH \/ 2 - centerY \* scale, scale\)/,
  );
});
