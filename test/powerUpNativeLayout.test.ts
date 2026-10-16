import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");

test("Power Up uses one scroll surface and keeps pet scene before inventory", () => {
  const page = source();
  assert.match(page, /#game-viewport-hud \.pupage-scroll \{\s*overflow-y: auto;/);
  assert.match(page, /#game-viewport-hud \.pupage-inventory \{[\s\S]*?margin-top: 18px;/);
  assert.match(page, /#game-viewport-hud \.pupage-stage \{[\s\S]*?height: clamp\(410px, 54dvh, 590px\);/);
  assert.ok(page.indexOf('className="pupage-stage"') < page.indexOf('className="pupage-inventory"'));
});

test("Power Up preserves admin oval, node orbit, item gestures and close", () => {
  const page = source();
  assert.match(page, /<PetPageOvalPlacement page="powerUp"/);
  assert.match(page, /<EvolutionPanel enabled fallbackRarity=\{rarity\} layout="orbit"/);
  assert.match(page, /onPointerDown=\{\(event\) => onPointerDown\(event, item\)\}/);
  assert.match(page, /data-testid="button-close-powerup-modal"/);
});
