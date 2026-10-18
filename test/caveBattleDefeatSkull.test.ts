import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("cave enemies use the current skull art without changing normal battle deaths", () => {
  const source = readFileSync("client/src/components/BattleArena.tsx", "utf8");
  assert.match(source, /import caveDefeatSkullPng from "@assets\/generated_images\/icon_skull_defeat.png"/);
  assert.equal(source.split('src={isCave ? caveDefeatSkullPng : skullPng}').length - 1, 2);
  assert.match(source, /skullBubbleFloat 1\.3s ease-out forwards/);
});
