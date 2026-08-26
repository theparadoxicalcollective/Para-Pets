import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const powerUpSource = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const evolutionSource = readFileSync("client/src/components/powerup/PowerUpEvolutionPanel.tsx", "utf8");
const evolutionSkinSource = readFileSync("client/src/components/powerup/EvolutionPanel.tsx", "utf8");

test("Power Up hides global navigation and keeps capacity above the pet stage", () => {
  assert.match(powerUpSource, /setNavHidden\(true\)/);
  assert.match(powerUpSource, /setNavHidden\(false\)/);
  assert.doesNotMatch(powerUpSource, /pupBagButton/);
  assert.doesNotMatch(powerUpSource, /pupage-sub/);

  const capacityMarkup = powerUpSource.indexOf('<section className="pupage-capacity"');
  const stageMarkup = powerUpSource.indexOf('<section className="pupage-stage"');
  assert.ok(capacityMarkup >= 0 && stageMarkup >= 0 && capacityMarkup < stageMarkup);
});

test("Power Up places the item tray before stats and keeps copy layered over artwork", () => {
  const inventoryMarkup = powerUpSource.indexOf('<section className="pupage-inventory"');
  const statsMarkup = powerUpSource.indexOf('<section className="pupage-stats"');
  assert.ok(inventoryMarkup >= 0 && statsMarkup >= 0 && inventoryMarkup < statsMarkup);
  assert.match(powerUpSource, /pupage-enhance-copy/);
  assert.match(powerUpSource, /className="pupage-enhance-count"/);
  assert.match(powerUpSource, />Remaining<\/span>/);
  assert.match(powerUpSource, /className="pupage-name"/);
  assert.match(powerUpSource, /pupage-level/);
  assert.match(powerUpSource, /pupage-stat-value/);
});

test("Evolution begins bottom-left and advances clockwise", () => {
  assert.match(evolutionSkinSource, /nth-of-type\(1\)\{left:24% !important;top:56% !important\}/);
  assert.match(evolutionSkinSource, /nth-of-type\(2\)\{left:12% !important;top:39% !important\}/);
  assert.match(evolutionSkinSource, /nth-of-type\(3\)\{left:29% !important;top:18% !important\}/);
  assert.match(evolutionSkinSource, /nth-of-type\(4\)\{left:71% !important;top:18% !important\}/);
  assert.match(evolutionSkinSource, /nth-of-type\(5\)\{left:88% !important;top:39% !important\}/);
  assert.match(evolutionSkinSource, /nth-of-type\(6\)\{left:76% !important;top:56% !important\}/);
});

test("Evolution modal escapes the pet stacking context and only active nodes open feeding", () => {
  assert.match(evolutionSource, /createPortal/);
  assert.match(evolutionSource, /pageScroll\.style\.overflowY = "hidden"/);
  assert.match(evolutionSource, /if \(current\) setPickerOpen\(true\)/);
  assert.match(evolutionSource, /if \(claimable\) void claimReward\(slot\)/);
  assert.match(evolutionSource, /if \(evolutionReady\) showNodeMessage\("Evolution Coming Soon"\)/);
  assert.match(evolutionSource, /showNodeMessage\(claimed \? "Reward Collected"/);
  assert.doesNotMatch(evolutionSource, /disabled=\{!current\}/);
  assert.match(evolutionSource, /align-items:center/);
  assert.match(evolutionSource, /filter:drop-shadow\(0 0 5px rgba\(65,236,151,.28\)\)/);
  assert.match(evolutionSource, /pupevo-slot\.current\{filter:drop-shadow\(0 0 10px/);
});

