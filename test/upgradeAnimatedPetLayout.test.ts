import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

for (const [name, source] of [["Power Up", power], ["Level Up", level]] as const) {
  test(`${name} animated pet stays inside its existing pet zone`, () => {
    assert.match(source, /<PetAnimator[\s\S]*?size=\{350\}[\s\S]*?fillContainer/);
    assert.match(source, /className="w-full h-full"/);
    assert.match(source, /style=\{\{ width: "100%", height: "100%", pointerEvents: "none" \}\}/);
    assert.doesNotMatch(source, /<PetAnimator[^>]*size=\{700\}/);
  });
}
