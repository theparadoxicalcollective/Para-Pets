import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const page = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("Power Up route owns the same stage page surface as other player pages", () => {
  assert.match(
    app,
    /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,180}<StagePageSurface key=\{location\}>[\s\S]{0,100}<PetLevelUpRoute \/>/,
  );
});

test("Power Up keeps close and pointer drag interactions on its owned surface", () => {
  assert.match(page, /data-testid="button-close-levelup-modal"/);
  assert.match(page, /onClick=\{onClose\}/);
  assert.match(page, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(page, /onPointerMove=\{onPointerMove\}/);
  assert.match(page, /onPointerUp=\{onPointerUp\}/);
  assert.match(page, /onPointerCancel=\{clearDrag\}/);
});

test("Power Up retains canonical iPhone-authored coordinates", () => {
  assert.match(page, /data-stage-coordinate-space="canonical"/);
  assert.match(page, /clientToStage\(event\.clientX, event\.clientY\)/);
  assert.match(page, /clientRectPointToStage\(r\)/);
});
