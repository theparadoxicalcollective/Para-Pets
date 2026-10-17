import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("gameplay toast viewport stays outside GameStage to avoid stage clipping and keeps the phone placement policy", () => {
  const app = read("client/src/App.tsx");
  const toast = read("client/src/components/ui/toast.tsx");

  const gameStageStart = app.indexOf("<GameStage>");
  const toasterIndex = app.indexOf("<Toaster />", gameStageStart);
  const gameStageEnd = app.indexOf("</GameStage>", gameStageStart);

  assert.ok(gameStageStart >= 0);
  assert.ok(gameStageEnd > gameStageStart);
  assert.ok(toasterIndex > gameStageEnd, "toast must render after GameStage so pet-menu feedback is not clipped by gameplay layers");
  assert.match(toast, /fixed left-1\/2 top-0/);
  assert.match(toast, /max-w-\[390px\]/);
  assert.match(toast, /-translate-x-1\/2/);
  assert.doesNotMatch(toast, /sm:bottom-0|sm:right-0|sm:top-auto|sm:flex-col|sm:slide-in-from-bottom-full/);
});

test("unhatched pet menu warnings reach the existing visible toast renderer", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const hook = read("client/src/hooks/use-toast.ts");
  const toaster = read("client/src/components/ui/toaster.tsx");

  assert.match(home, /const requireHatchedActivePet = \\(\\) => \\{[\\s\\S]*?toast\\(\\{ title: "Must hatch Egg first" \\}\\)/);
  for (const action of ["power-up", "level-up", "equip-accessories", "care-feed"]) {
    assert.match(home, new RegExp(`data-testid="button-action-${action}"[^\\n]*requireHatchedActivePet\\(\\)`));
  }
  assert.match(hook, /function toast\\(\\{ \\.\\.\\.props \\}: Toast\\)[\\s\\S]*?dispatch\\(\\{[\\s\\S]*?type: "ADD_TOAST"/);
  assert.match(toaster, /toasts\\.map/);
  assert.match(toaster, /<ToastTitle>\\{title\\}<\\/ToastTitle>/);
  assert.match(toaster, /<ToastViewport \\/>/);
});

test("click sparkles portal through the authoritative stage coordinate contract", () => {
  const source = read("client/src/lib/interactionEffects.ts");

  assert.match(source, /getStagePortalTarget/);
  assert.match(source, /clientToStagePortal\(clientX, clientY\)/);
  assert.match(source, /target === document\.body \? "fixed" : "absolute"/);
  assert.match(source, /target\.appendChild\(burst\)/);
  assert.doesNotMatch(source, /document\.body\.appendChild\(burst\)/);
});

test("golden reward orbs use logical coordinates on scaled stages", () => {
  const source = read("client/src/lib/goldenOrbs.ts");

  assert.match(source, /getStagePortalTarget/);
  assert.match(source, /clientToStagePortal\(x, y\)/);
  assert.match(source, /const position = target === document\.body \? "fixed" : "absolute"/);
  assert.match(source, /left: \$\{point\.x\}px/);
  assert.match(source, /top: \$\{point\.y\}px/);
  assert.match(source, /target\.appendChild\(orb\)/);
  assert.doesNotMatch(source, /document\.body\.appendChild\(orb\)/);
});

test("the native iPhone 12 path is preserved by body-owned stage portals", () => {
  const stage = read("client/src/lib/stage.ts");

  assert.match(stage, /if \(stage\?\.dataset\.coordinateOwner === "viewport"\) return document\.body/);
  assert.match(stage, /return getStagePortalTarget\(\) === document\.body[\s\S]*?\{ x: clientX, y: clientY \}/);
});

test("coin shop reward bursts seed from the rendered player stage instead of the browser viewport", () => {
  const source = read("client/src/pages/CoinShopPage.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(source, /getStageRenderedPoint/);
  assert.match(source, /getStageRenderedPoint\(1 \/ 3, 1 \/ 3\)/);
  assert.match(source, /getStageRenderedPoint\(2 \/ 3, 1 \/ 3\)/);
  assert.doesNotMatch(source, /window\.innerWidth/);
  assert.doesNotMatch(source, /window\.innerHeight/);

  assert.match(stage, /export function getStageRenderedPoint/);
  assert.match(stage, /surface\.left \+ surface\.logicalWidth \* surface\.scale \* xRatio/);
  assert.match(stage, /surface\.top \+ surface\.logicalHeight \* surface\.scale \* yRatio/);
});
