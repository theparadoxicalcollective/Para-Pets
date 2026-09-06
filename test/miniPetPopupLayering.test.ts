import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../client/src/miniPetTransparencyFix.css"), "utf8");
const layerManager = readFileSync(resolve(here, "../client/src/lib/layerManager.ts"), "utf8");

test("active Mini Pet stays below the global popup stack", () => {
  const miniPetMatch = css.match(/active-pet-mini-pet-stage-layer[\s\S]*?z-index:\s*(\d+)\s*!important/);
  const modalBaseMatch = layerManager.match(/let\s+_z\s*=\s*(\d+)/);

  assert.ok(miniPetMatch, "expected an explicit Active Pet Mini Pet z-index override");
  assert.ok(modalBaseMatch, "expected layerManager to declare its popup z-index base");

  const miniPetZ = Number(miniPetMatch[1]);
  const firstPopupZ = Number(modalBaseMatch[1]) + 1;

  assert.ok(miniPetZ < firstPopupZ, `Mini Pet z-index ${miniPetZ} must stay below popup z-index ${firstPopupZ}`);
});
