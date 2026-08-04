import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("client/src/pages/ElysianBayouClearingPage.tsx", "utf8");
const sceneSource = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
const combatSource = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
const configSource = readFileSync("client/src/lib/elysianClearingCombatConfig.ts", "utf8");

test("Clearing alone selects its configured movement speed and newest organized background", () => {
  assert.match(pageSource, /movementSpeed: 0\.17/);
  assert.doesNotMatch(pageSource, /movementSpeed: 0\.26/);
  assert.match(pageSource, /@assets\/uploads\/ElysianClearingBackground\.jpeg/);
  assert.match(sceneSource, /src=\{config\.backgroundUrl\}/);
  assert.match(sceneSource, /cameraTarget\(petPos, world, viewport\)/);
});

test("pet health is a clamped, conditional world-space sibling overlay", () => {
  assert.doesNotMatch(combatSource, /top:"max\(42px/);
  assert.match(combatSource, /\(threatened\|\|recentlyDamaged\).*data-testid="clearing-pet-health-bar"/);
  assert.match(combatSource, /\["pursuing", "windup", "recovering"\]/);
  assert.match(combatSource, /Math\.max\(0, Math\.min\(100/);
  assert.match(combatSource, /left:`\$\{petPos\.x\*100\}%`,top:`\$\{petPos\.y\*100\}%`/);
  assert.match(configSource, /recentDamageDisplayMs: 1800/);
  assert.ok(combatSource.indexOf('data-testid="clearing-pet-health-bar"') > combatSource.lastIndexOf("const threatened"));
});

test("confirmed defeats capture one stable skull effect before enemy replacement", () => {
  assert.match(combatSource, /@assets\/Photoroom_20260705_103527_PM_1783308939570\.png/);
  assert.match(combatSource, /enemyInstanceId:struckInstanceId,x:struck\.x,y:struck\.y/);
  assert.ok(combatSource.indexOf("setDeathEffects(current=>[...current,defeated])") < combatSource.indexOf("struck.instanceId=String(data.nextEnemy.instanceId"));
  assert.match(combatSource, /CFG\.deathEffect\.durationMs/);
  assert.match(combatSource, /deathEffects\.map/);
  assert.equal((combatSource.match(/Photoroom_20260705_103527_PM_1783308939570/g) ?? []).length, 1);
});

test("effects share the world transform while attack controls use the fixed HUD portal", () => {
  assert.match(sceneSource, /<ElysianClearingCombat[\s\S]*hudElement=\{hudElement\}/);
  assert.match(combatSource, /createPortal\(fixedHud,hudElement\)/);
  assert.match(combatSource, /data-testid="button-clearing-attack"[\s\S]*pointer-events-auto/);
  assert.match(combatSource, /timers\.current\.forEach\(clearTimeout\)/);
});

test("Clearing uses one whole-sprite presentation animation and bounded enemy pressure",()=>{
  assert.match(sceneSource,/mode="static"/);
  assert.match(sceneSource,/clearing-pet-presentation/);
  assert.match(combatSource,/maxSimultaneousAttackers/);
  assert.match(combatSource,/resolveEnemyPairs/);
  assert.match(combatSource,/document\.visibilityState/);
  assert.doesNotMatch(combatSource,/\},\[onRespawn,worldPixels/);
});
