import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
test("unhatched active pet blocks all four pet actions with the same message", () => {
  assert.ok(home.includes('toast({ title: "Must hatch Egg first" })'));
  for (const action of ["power-up", "level-up", "equip-accessories", "care-feed"]) {
    const start = home.indexOf(`data-testid="button-action-${action}"`);
    assert.ok(start >= 0, `${action} button exists`);
    const end = home.indexOf("</button>", start);
    assert.ok(home.slice(start, end).includes("if (!requireHatchedActivePet()) return;"), `${action} requires hatch`);
  }
});
test("active egg is enlarged and bottom-aligned in its scene container", () => {
  assert.ok(home.includes('width: "75%"'));
  assert.ok(home.includes('maxHeight: "75%"'));
  assert.ok(home.includes('alignItems: "flex-end"'));
});

test("tapping an unhatched egg opens hatching item panel; ready eggs have explicit hatch action", () => {
  const eggTap = home.slice(home.indexOf('data-testid="button-egg-tap"'), home.indexOf('{activePet.eggImageUrl ?', home.indexOf('data-testid="button-egg-tap"')));
  assert.ok(eggTap.includes('setShowSpeedUp(true)'));
  assert.ok(home.includes('data-testid="active-pet-speedup-viewport-modal"'));
  assert.ok(home.includes('data-testid="button-hatch-ready-egg"'));
  assert.ok(home.includes('data-bj="egg-drop-zone"'));
  assert.ok(home.includes('onPointerDown={(e) => handleHomeSheetItemPointerDown(e, item)}'));
});
