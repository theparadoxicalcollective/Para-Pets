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

test("cave pet drag is viewport-relative, bounded and drives the laser caster without changing normal battles", () => {
  const source = readFileSync("client/src/components/BattleArena.tsx", "utf8");
  assert.match(source, /data-testid="cave-block-beside-potions" className="[^"]*mr-\[clamp\(16px,4vw,48px\)\]/);
  assert.match(source, /Math\.max\(14, Math\.min\(86, x\)\)/);
  assert.match(source, /onPointerDown=\{isCave \? onCavePetDown : handlePetClick\}/);
  assert.match(source, /onPointerMove=\{isCave \? onCavePetMove : undefined\}/);
  assert.match(source, /onPointerUp=\{isCave \? onCavePetUp : undefined\}/);
  assert.match(source, /isCave && fx\.casterIdx === 0 \? \{ x: cavePetX, y: PET_Y \}/);
});
