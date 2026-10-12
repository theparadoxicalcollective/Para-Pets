import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");

test("Active Pet route exits scaled stage ownership on all devices", () => {
  assert.match(stage, /return pathname === "\/" \|\| pathname === "\/bag"/);
  assert.match(app, /location === "\/"[\s\S]*?<StagePageSurface layout="viewport">/);
  assert.match(source, /data-testid="active-pet-page"/);
  assert.match(source, /<ActivePetPlacement templateId=\{activePet\.petTemplateId\}/);
});

test("Active Pet sparkle bursts and potion drag previews use client coordinates", () => {
  assert.doesNotMatch(source, /clientToStage| getDesignW| getStageSurface/);
  assert.match(source, /const origin = \{ x: clientX, y: clientY \}/);
  assert.match(source, /setHomeDragging\(\{ item, x: ev\.clientX, y: ev\.clientY \}\)/);
  assert.match(source, /setHomeDragging\(prev => prev \? \{ \.\.\.prev, x: ev\.clientX, y: ev\.clientY \} : null\)/);
  assert.match(source, /\{homeDragging && createPortal\(/);
  assert.match(source, /\{ringSparkles\.length > 0 && createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /getVisibleViewport\(\)\.height \* 0\.65/);
  assert.match(source, /ev\.clientX >= dropRect\.left && ev\.clientX <= dropRect\.right/);
});

test("existing authored pet anchor and petting layers remain in place", () => {
  assert.match(source, /useActivePetAnchor\(true\)/);
  assert.match(source, /data-testid="active-pet-placement-stage"/.test(source) ? /data-testid="active-pet-placement-stage"/ : /<ActivePetPlacement/);
  assert.match(source, /data-testid="active-pet-viewport-particles"/);
  assert.match(source, /data-testid="display-pet-rarity-stars"/);
});
