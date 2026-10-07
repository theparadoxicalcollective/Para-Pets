import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("owner and visitor interiors use the shared expanded viewport scene", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /data-testid="pet-home-interior-camera"/);
  assert.match(visitor, /data-testid="visit-pet-home-interior-camera"/);
  assert.match(owner, /<ViewportScenePortal>/);
  assert.match(visitor, /<ViewportScenePortal>/);
  assert.match(owner, /className="absolute inset-0"/);
  assert.match(visitor, /className="absolute inset-0"/);
});

test("interior camera keeps the real room image as the authored coordinate canvas", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /const imgW = h \* aspectRef\.current/);
    assert.match(source, /centeredHomeCameraPanX\(w, imgW\)/);
    assert.match(source, /clampHomeCameraPanX\(drag\.startPanX \+ panDelta, w, imgW\)/);
    assert.match(source, /height: "100%"/);
    assert.match(source, /width: "auto"/);
    assert.match(source, /maxWidth: "none"/);
  }

  assert.match(owner, /const left = panX \+ item\.xPct \* imgWidth/);
  assert.match(owner, /const top = item\.yPct \* containerH/);
  assert.match(owner, /const left = panX \+ xPct \* imgWidth/);
  assert.match(owner, /const top = yPct \* containerH/);
  assert.match(visitor, /left: panX \+ item\.xPct \* imgWidth/);
  assert.match(visitor, /top: item\.yPct \* containerH/);
  assert.match(visitor, /left: panX \+ xPct \* imgWidth/);
  assert.match(visitor, /top: yPct \* containerH/);
});

test("interior visual extension is non-interactive and stays behind the real room", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /data-testid="pet-home-interior-camera-extension"/);
  assert.match(visitor, /data-testid="visit-pet-home-interior-camera-extension"/);
  assert.match(owner, /object-cover opacity-45 blur-md pointer-events-none/);
  assert.match(visitor, /object-cover opacity-45 blur-md pointer-events-none/);
  assert.match(owner, /data-testid="pet-home-interior-extension-darkness"/);
  assert.match(visitor, /data-testid="visit-pet-home-interior-extension-darkness"/);

  for (const source of [owner, visitor]) {
    assert.match(source, /camera-extension"[\s\S]*?style=\{\{ zIndex: 0 \}\}/);
    assert.match(source, /extension-darkness"[\s\S]*?zIndex: 0/);
    assert.match(source, /left: `\$\{panX\}px`[\s\S]*?zIndex: 1/);
  }
});

test("precise darkness and lamp effects remain clipped to authored interior image space", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /<HomeInteriorDarknessLayer[\s\S]*?panX=\{panX\}[\s\S]*?imgWidth=\{imgWidth\}[\s\S]*?sceneHeight=\{containerH\}/);
    assert.match(source, /<HomeInteriorEffectsLayer[\s\S]*?panX=\{panX\}[\s\S]*?imgWidth=\{imgWidth\}[\s\S]*?sceneHeight=\{containerH\}/);
  }
});

test("owner interior drag/drop stores percentages from the live expanded interior camera", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /panStateRef: React\.MutableRefObject<\{ panX: number; imgWidth: number; containerH: number; element: HTMLDivElement \| null \} \| null>/);
  assert.match(owner, /panStateRef\.current = \{ panX: newPanX, imgWidth: imgW, containerH: h, element: container \}/);
  assert.match(owner, /const dropElement = interior\?\.element \?\? container/);
  assert.match(owner, /const dropRect = dropElement\.getBoundingClientRect\(\)/);
  assert.match(owner, /homeClientPointToPlacement\([\s\S]*?interior\.panX,[\s\S]*?interior\.imgWidth,[\s\S]*?interior\.containerH,[\s\S]*?clientToStage/);
  assert.match(owner, /HOME_INVENTORY_DROP_BOUNDS/);
  assert.doesNotMatch(owner, /clientPointInStageElement/);
});

test("sleep and fire snap math remains normalized to the real room image", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /getHouseInteriorSleepSnapPosition\([\s\S]*?imgWidthRef\.current \/ Math\.max\(containerHRef\.current, 1\)/);
  assert.match(owner, /isHouseInteriorPointOverActiveFire\([\s\S]*?imageAspect/);
  assert.match(visitor, /isHouseInteriorPointOverActiveFire\([\s\S]*?imageAspect/);
  assert.match(visitor, /isHouseInteriorSleepPosition\([\s\S]*?imageAspect/);
});

test("leave sparkle remains an authored percentage inside the real interior canvas", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /data-testid="button-interior-exit-sparkle"/);
    assert.match(source, /left: imgWidth > 0 \? panX \+ leaveButtonX \* imgWidth/);
    assert.match(source, /leaveButtonY \* containerH/);
  }
});

test("iPhone 12 keeps the inline scene path and existing reference stage", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /viewportOwned: true/);
});
