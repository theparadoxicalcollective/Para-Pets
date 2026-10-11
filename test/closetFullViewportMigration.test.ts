import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const closet = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const costumes = readFileSync("client/src/components/PetCostumeEquipmentSection.tsx", "utf8");
const css = readFileSync("client/src/tabletStageShell.css", "utf8");

test("Closet route uses full device viewport rather than reference plane", () => {
  assert.match(app, /location === "\/equip-accessories"[\s\S]{0,160}<StagePageSurface layout="viewport">/);
  assert.match(css, /\[data-responsive-closet="true"\], \[data-device-closet="true"\]\)/);
  assert.match(css, /\[data-testid="closet-pet-preview"\]/);
  assert.match(css, /\.closet-accessory-slots/);
  assert.match(css, /\.closet-adornment-slots/);
  assert.match(css, /\.closet-mini-pet-panel/);
  assert.match(css, /\.closet-accessory-drawer/);
});

test("Closet keeps original admin oval, equipment APIs and client-space slot targeting", () => {
  assert.match(closet, /<PetPageOvalPlacement page="closet"/);
  assert.match(closet, /data-slot-index=\{slot\}/);
  assert.match(closet, /document\.elementFromPoint\(point\.clientX, point\.clientY\)/);
  assert.match(closet, /\/api\/pet\/\$\{petInventoryId\}\/accessories/);
  assert.match(costumes, /closet-adornment-slots/);
});

test("responsive device Closet retains an explicit embedded fallback", () => {
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*?\[data-page-presentation="full-viewport"\]/);
  assert.match(closet, /data-stage-coordinate-space=\{deviceSurface \? "viewport" : "canonical"\}/);
});
