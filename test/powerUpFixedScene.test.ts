import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");

test("Power Up is a fixed viewport composition with no scrolling pet/nameplate", () => {
  assert.match(page, /#game-viewport-hud \.pupage-scroll \{[\s\S]*?display: grid;/);
  assert.match(page, /grid-template-rows: auto auto auto minmax\(0, 1fr\) auto;/);
  assert.match(page, /#game-viewport-hud \.pupage-scroll \{[\s\S]*?overflow: hidden;/);
  assert.match(page, /#game-viewport-hud \.pupage-stage \{[\s\S]*?height: 100%;/);
  assert.match(page, /#game-viewport-hud \.pupage-inventory \{[\s\S]*?align-self: end;/);
});

test("Power Up does not modify global body styles or portal a backdrop into Active Pet", () => {
  assert.doesNotMatch(page, /document\.body\.style\.(overflow|touchAction)\s*=/);
  assert.doesNotMatch(page, /document\.documentElement\.style\.overflow\s*=/);
  assert.doesNotMatch(page, /<ViewportBackdropPortal/);
  assert.match(page, /className="pupage-fixed-backdrop"/);
  assert.match(page, /return \(\) => setNavHidden\(false\)/);
});

test("Power Up retains admin pet placement and gameplay interaction", () => {
  assert.match(page, /<PetPageOvalPlacement page="powerUp"/);
  assert.match(page, /<EvolutionPanel enabled fallbackRarity=\{rarity\} layout="orbit"/);
  assert.match(page, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(page, /data-testid="button-close-powerup-modal"/);
});
