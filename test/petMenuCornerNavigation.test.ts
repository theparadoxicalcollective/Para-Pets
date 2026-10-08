import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");

test("Pet Menu is anchored to the opposite lower corner with circular rightward options", () => {
  assert.match(home, /data-testid="active-pet-side-menu"/);
  assert.match(home, /left: 12, bottom: "calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\)"/);
  assert.match(home, /data-testid="pet-menu-options" className="flex items-center gap-2"/);
  for (const id of ["power-up", "level-up", "equip-accessories", "care-feed"]) {
    assert.match(home, new RegExp(`data-testid="button-action-${id}"[^\\n]*rounded-full`));
  }
  assert.match(nav, /bottom: 16/);
  assert.match(nav, /right: 12/);
});

test("main navigation and pet menu close each other when opened", () => {
  assert.match(home, /window\.dispatchEvent\(new Event\("para-pets:pet-menu-open"\)\)/);
  assert.match(home, /window\.addEventListener\("para-pets:main-nav-open", closeForMainNav\)/);
  assert.match(nav, /window\.dispatchEvent\(new Event\("para-pets:main-nav-open"\)\)/);
  assert.match(nav, /window\.addEventListener\("para-pets:pet-menu-open", closeForPetMenu\)/);
});
