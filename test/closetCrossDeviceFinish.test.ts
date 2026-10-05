import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Closet expands only its environment while preserving the authored template", () => {
  const source = read("client/src/components/PetEquipAccessoriesPage.tsx");

  assert.match(source, /useStageSurroundings\(\{/);
  assert.match(source, /imageUrl: closetBackground/);
  assert.match(source, /<ViewportScenePortal interactive=\{false\}>/);
  assert.match(source, /data-testid="closet-viewport-environment"/);
  assert.match(source, /backgroundSize: "cover"/);
  assert.match(source, /data-testid="closet-authored-template"/);
  assert.match(source, /maxWidth: 768/);
});

test("Closet template background keeps the existing placement geometry instead of being redesigned for tablets", () => {
  const source = read("client/src/components/PetEquipAccessoriesPage.tsx");

  assert.match(source, /<img src=\{closetBackground\}[\s\S]*?objectFit: "fill"/);
  assert.match(source, /data-testid="closet-pet-preview"[\s\S]*?left: "19%"[\s\S]*?top: "21\.2%"[\s\S]*?width: "56%"[\s\S]*?height: "39\.5%"/);
  assert.match(source, /data-testid="button-open-mini-pets"[\s\S]*?left: "7\.5%"[\s\S]*?top: "43\.5%"[\s\S]*?width: "15\.5%"/);
  assert.match(source, /aria-label="Accessory slots"[\s\S]*?left: "5\.5%"[\s\S]*?top: "60\.1%"[\s\S]*?width: "89%"[\s\S]*?height: "12\.2%"/);
});

test("Closet touch drag ghost follows shared stage portal coordinates on larger devices", () => {
  const source = read("client/src/components/PetEquipAccessoriesPage.tsx");

  assert.match(source, /const ghostTarget = getStagePortalTarget\(\)/);
  assert.match(source, /ghost\.style\.position = ghostTarget === document\.body \? "fixed" : "absolute"/);
  assert.match(source, /const startPoint = clientToStagePortal\(touch\.clientX, touch\.clientY\)/);
  assert.match(source, /const ghostPoint = clientToStagePortal\(point\.clientX, point\.clientY\)/);
  assert.match(source, /ghostTarget\.appendChild\(ghost\)/);
  assert.doesNotMatch(source, /document\.body\.appendChild\(ghost\)/);
});

test("Closet slot hit testing stays in client space against the real rendered slot elements", () => {
  const source = read("client/src/components/PetEquipAccessoriesPage.tsx");

  assert.match(source, /document\.elementFromPoint\(point\.clientX, point\.clientY\)\?\.closest\("\[data-slot-index\]"/);
  assert.match(source, /data-slot-index=\{slot\}/);
});

test("Closet drawers dialogs and mini-pet inventory remain inside the authored template", () => {
  const source = read("client/src/components/PetEquipAccessoriesPage.tsx");
  const template = source.indexOf('data-testid="closet-authored-template"');
  const mini = source.indexOf('data-testid="mini-pet-inventory"', template);
  const bag = source.indexOf('data-testid="accessory-bag-drawer"', template);
  const dialog = source.indexOf("function ClosetDialog");

  assert.ok(template >= 0);
  assert.ok(mini > template);
  assert.ok(bag > template);
  assert.ok(dialog > template);
});

test("iPhone 12 keeps the inline Closet path and reference stage", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /viewportOwned: true/);
});
