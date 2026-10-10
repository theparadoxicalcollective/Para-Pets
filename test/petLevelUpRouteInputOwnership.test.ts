import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const page = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("Power Up route owns the same stage page surface as other player pages", () => {
  assert.match(
    app,
    /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,180}<StagePageSurface key=\{location\} layout="viewport">[\s\S]{0,100}<PetLevelUpRoute \/>/,
  );
});

test("Power Up keeps close and pointer drag interactions on its owned surface", () => {
  assert.match(page, /data-testid="button-close-levelup-modal"/);
  assert.match(page, /onClick=\{onClose\}/);
  assert.match(page, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(page, /onPointerMove=\{onPointerMove\}/);
  assert.match(page, /onPointerUp=\{onPointerUp\}/);
  assert.match(page, /onPointerCancel=\{\(\) => \{ dragStartRef\.current = null; suppressNextClickRef\.current = true; clearDrag\(\); \}\}/);
});

test("isolated Level Up uses page-local pointer positions rather than stage conversion", () => {
  assert.match(page, /data-stage-coordinate-space="canonical"/);
  assert.match(page, /pageRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(page, /localPoint\(event\.clientX, event\.clientY\)/);
  assert.match(page, /localPoint\(r\.left \+ r\.width \/ 2, r\.top \+ r\.height \/ 2\)/);
  assert.doesNotMatch(page, /clientToStage\(/);
});

test("Level Up accepts touch taps and preserves drag and keyboard activation", () => {
  assert.match(page, /if \(!moved \|\| dropped\) useItem\(current\.item\)/);
  assert.match(page, /suppressNextClickRef\.current = true/);
  assert.match(page, /event\.detail === 0 && !dragRef\.current/);
  assert.match(page, /Tap an item or drag it onto/);
});
