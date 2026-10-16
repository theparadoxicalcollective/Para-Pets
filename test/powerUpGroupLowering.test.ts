import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");

test("Power Up shifts only the gameplay group downward near the infusion tray", () => {
  assert.match(power, /#game-viewport-hud \.pupage-stage \{\s*transform: translate3d\(0, clamp\(26px, 4dvh, 52px\), 0\);/);
  assert.match(power, /@media \(max-height: 700px\) \{\s*#game-viewport-hud \.pupage-stage \{\s*transform: translate3d\(0, clamp\(12px, 2dvh, 24px\), 0\);/);
  assert.match(power, /grid-template-rows: auto auto auto minmax\(0, 1fr\) auto;/);
  assert.match(power, /className="pupage-stage"/);
  assert.match(power, /className="pupage-inventory"/);
  assert.match(power, /<PetPageOvalPlacement page="powerUp"/);
});
