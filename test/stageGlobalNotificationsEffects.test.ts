import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("gameplay toast viewport stays inside GameStage and keeps the phone placement policy", () => {
  const app = read("client/src/App.tsx");
  const toast = read("client/src/components/ui/toast.tsx");

  const gameStageStart = app.indexOf("<GameStage>");
  const toasterIndex = app.indexOf("<Toaster />", gameStageStart);
  const gameStageEnd = app.indexOf("</GameStage>", gameStageStart);

  assert.ok(gameStageStart >= 0);
  assert.ok(toasterIndex > gameStageStart && toasterIndex < gameStageEnd);
  assert.match(toast, /fixed left-1\/2 top-0/);
  assert.match(toast, /max-w-\[390px\]/);
  assert.match(toast, /-translate-x-1\/2/);
  assert.doesNotMatch(toast, /sm:bottom-0|sm:right-0|sm:top-auto|sm:flex-col|sm:slide-in-from-bottom-full/);
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
