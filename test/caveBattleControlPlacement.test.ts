import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("cave block shares bottom controls with three potion slots without changing normal battle placement", () => {
  const source = readFileSync("client/src/components/BattleArena.tsx", "utf8");
  assert.match(source, /phase === "battle" && !isCave/);
  assert.match(source, /data-testid="cave-block-beside-potions"/);
  assert.match(source, /isCave && phase === "battle"/);
  assert.match(source, /Array\.from\(\{ length: isCave \? 3 : 5 \}/);
  const caveBlock = source.indexOf('data-testid="cave-block-beside-potions"');
  const potionBar = source.indexOf('flex gap-2 items-center pointer-events-auto rounded-2xl', caveBlock);
  assert.ok(caveBlock >= 0 && potionBar > caveBlock);
  assert.match(source.slice(caveBlock, potionBar), /data-testid="button-battle-block"/);
});
