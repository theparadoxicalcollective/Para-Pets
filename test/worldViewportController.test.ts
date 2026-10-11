import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("shared world viewport controller owns frame measurement and pan lifecycle", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(source, /const \[viewportElement, setViewportElement\] = useState<HTMLDivElement \| null>\(null\)/);
  assert.match(source, /const vpRef = useCallback\(\(element: HTMLDivElement \| null\) => \{[\s\S]*setViewportElement\(element\)/);
  assert.match(source, /useLayoutEffect\(\(\) => \{[\s\S]*const el = viewportElement/);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /observer\.observe\(el\)/);
  assert.match(source, /\}, \[viewportElement\]\)/);
  assert.doesNotMatch(source, /const el = vpRef\.current/);
  assert.doesNotMatch(source, /window\.addEventListener\("orientationchange", measure\)/);
  assert.doesNotMatch(source, /visualViewport|window\.innerWidth|window\.innerHeight|display-mode: standalone/);
  assert.doesNotMatch(source, /clientDeltaToStage\(/);
  assert.match(source, /viewportElement\?\.getBoundingClientRect\(\)/);
  assert.match(source, /frameWRef\.current \/ rect\.width/);
  assert.match(source, /frameHRef\.current \/ rect\.height/);
  assert.doesNotMatch(source, /getStageScale\(\)/);
  assert.match(source, /WORLD_MAP_PAN_THRESHOLD_PX = 4/);
  assert.match(source, /WORLD_MAP_POST_PAN_CLICK_MS = 80/);
  assert.match(source, /safeSetWorldPointerCapture\(event\.currentTarget, event\.pointerId\)/);
  assert.match(source, /typeof element\.setPointerCapture !== "function"/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /addEventListener\("wheel", handleVpWheel, \{ passive: false \}\)/);
});

test("viewport controller preserves no-blank-space fit and camera focus across browser viewport changes", () => {
  const source = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(source, /calculateWorldFitScale\(/);
  assert.match(source, /clampWorldMapOffset\(/);
  assert.match(source, /mapHRef\.current,[\s\S]*?false,[\s\S]*?mapWidth/);
  assert.match(source, /nextX = \(frameWRef\.current - mapWidth \* fitScale\) \/ 2/);
  assert.match(source, /nextY = \(frameHRef\.current - mapHRef\.current \* fitScale\) \/ 2/);
  assert.match(source, /const focusX = \(previousFrame\.width \/ 2 - previous\.x\) \/ \(mapWidth \* previousScale\)/);
  assert.match(source, /const focusY = \(previousFrame\.height \/ 2 - previous\.y\) \/ \(mapHRef\.current \* previousScale\)/);
  assert.match(source, /cameraFrameRef\.current = \{ width: frameWRef\.current, height: frameHRef\.current \}/);
  assert.match(source, /mapPanStartRef\.current = \{[\s\S]*?mapX: clamped\.x,[\s\S]*?mapY: clamped\.y/);
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
  assert.match(worldPage, /onPointerCancel=\{handleVpPointerCancel\}/);
  assert.match(worldPage, /onLostPointerCapture=\{handleVpPointerCancel\}/);

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

test("World camera uses Pet Home-style cancellation and lost-capture recovery", () => {
  const controller = read("client/src/worlds/useWorldViewportController.ts");
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(controller, /const finishViewportPointer = useCallback/);
  assert.match(controller, /const handleVpPointerCancel = useCallback/);
  assert.match(controller, /finishViewportPointer\(event, true\)/);
  assert.match(controller, /mapPanPointersRef\.current\.delete\(event\.pointerId\)/);
  assert.match(controller, /mapPanStartRef\.current = null/);
  assert.match(controller, /mapPanningRef\.current = false/);

  assert.match(worldPage, /onPointerCancel=\{handleVpPointerCancel\}/);
  assert.match(worldPage, /onLostPointerCapture=\{handleVpPointerCancel\}/);
  assert.match(worldPage, /touchAction: "none"/);
  assert.match(worldPage, /WebkitTouchCallout: "none"/);
  assert.match(worldPage, /overscrollBehavior: "none"/);
  assert.match(worldPage, /onContextMenu=\{event => event\.preventDefault\(\)\}/);
});


test("the themed World loading screen renders above the expanded scene layer", () => {
  const app = read("client/src/App.tsx");
  const gateStart = app.indexOf("function WorldLoadingGate");
  const gateEnd = app.indexOf("/** Wraps the entire router", gateStart);
  const gate = app.slice(gateStart, gateEnd);

  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  assert.match(gate, /!screenDone[\s\S]*<ViewportModalPortal>[\s\S]*<WorldLoadingScreen/);
  assert.match(gate, /<\/ViewportModalPortal>/);
});
