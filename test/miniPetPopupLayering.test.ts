import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../client/src/miniPetTransparencyFix.css"), "utf8");
const layerManager = readFileSync(resolve(here, "../client/src/lib/layerManager.ts"), "utf8");
const home = readFileSync(resolve(here, "../client/src/pages/HomePage.tsx"), "utf8");
const closet = readFileSync(resolve(here, "../client/src/components/PetEquipAccessoriesPage.tsx"), "utf8");

test("active Mini Pet stays below the global popup stack", () => {
  const miniPetMatch = css.match(/active-pet-mini-pet-stage-layer[\s\S]*?z-index:\s*(\d+)\s*!important/);
  const modalBaseMatch = layerManager.match(/let\s+_z\s*=\s*(\d+)/);

  assert.ok(miniPetMatch, "expected an explicit Active Pet Mini Pet z-index override");
  assert.ok(modalBaseMatch, "expected layerManager to declare its popup z-index base");

  const miniPetZ = Number(miniPetMatch[1]);
  const firstPopupZ = Number(modalBaseMatch[1]) + 1;

  assert.ok(miniPetZ < firstPopupZ, `Mini Pet z-index ${miniPetZ} must stay below popup z-index ${firstPopupZ}`);

  const actionMenuZ = Number(home.match(/fixed inset-0 z-(\d+) flex items-center justify-center/)?.[1] ?? 0);
  assert.ok(actionMenuZ > 0, "expected Active Pet action menu z-index");
  assert.ok(miniPetZ < actionMenuZ, `Mini Pet z-index ${miniPetZ} must stay below Active Pet popup z-index ${actionMenuZ}`);
});

test("Closet Mini Pet stays below its drawers and confirmation dialogs", () => {
  const miniButtonZ = Number(closet.match(/button-open-mini-pets[\s\S]*?className="absolute z-\[(\d+)\]/)?.[1] ?? 0);
  const bagZ = Number(closet.match(/accessory-bag-drawer[\s\S]*?z-\[(\d+)\]/)?.[1] ?? 0);
  const miniInventoryZ = Number(closet.match(/mini-pet-inventory[\s\S]*?z-\[(\d+)\]/)?.[1] ?? 0);
  const dialogZ = Number(closet.match(/ClosetDialog[\s\S]*?absolute inset-0 z-\[(\d+)\]/)?.[1] ?? 0);

  assert.ok(miniButtonZ > 0 && bagZ > 0 && miniInventoryZ > 0 && dialogZ > 0);
  assert.ok(miniButtonZ < bagZ);
  assert.ok(miniButtonZ < miniInventoryZ);
  assert.ok(miniButtonZ < dialogZ);
  assert.match(css, /button-open-mini-pets[\s\S]*?isolation:\s*isolate/);
});
