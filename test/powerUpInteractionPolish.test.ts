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

test("Power Up locks the viewport and keeps the compact controls readable", () => {
  assert.match(powerUpSource, /pupage-scroll\{height:100%;width:100%;overflow:hidden/);
  assert.match(powerUpSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(powerUpSource, /pupage-cap-track\{height:11px/);
  assert.match(powerUpSource, /pupage-enhance\{position:relative;width:min\(58%,310px\)/);
  assert.match(powerUpSource, /pupage-enhance-count\{color:#72f2a8/);
  assert.match(powerUpSource, /pupage-corner\{position:absolute;top:0;width:38px;height:38px/);
  assert.match(powerUpSource, /pupage-nameplate\{position:absolute;left:50%;bottom:-1px;width:min\(74%,410px\)/);
  assert.doesNotMatch(powerUpSource, /pupage-item:not\(\.disabled\)::before/);
  assert.match(powerUpSource, /pupage-item:not\(\.disabled\) img\{filter:drop-shadow/);
  assert.match(powerUpSource, /pupage-item-caption\{[^}]*color:#70efa8[^}]*border-radius:999px/);
  assert.match(powerUpSource, /pupage-items-window\{[^}]*top:24%;height:49%/);
  assert.doesNotMatch(evolutionSkinSource, /pupevo-slot::after/);
  assert.match(evolutionSkinSource, /pupevo-slot:not\(\.locked\)>img,[\s\S]*filter:drop-shadow/);
  assert.match(evolutionSkinSource, /pupevo-slot\.current>img \{ filter:drop-shadow/);
});

test("Power Up keeps the compact capacity and enhancement copy free of duplicate labels", () => {
  assert.match(powerUpSource, /<span>{used} used<\/span><span>{capacity} total<\/span>/);
  assert.doesNotMatch(powerUpSource, />POWER UP CAPACITY</);
  assert.doesNotMatch(powerUpSource, /{remaining} available/);
  assert.doesNotMatch(powerUpSource, /total through Lv\./);
  assert.match(powerUpSource, /pupage-enhance-copy/);
  assert.match(powerUpSource, /flex-direction:row/);
  assert.match(powerUpSource, /className="pupage-enhance-count"/);
  assert.match(powerUpSource, />Remaining<\/span>/);
  assert.match(powerUpSource, /className="pupage-name"/);
  assert.match(powerUpSource, /pupage-level/);
});

test("Power Up opens pet stats in a modal instead of rendering them in the main flow", () => {
  const inventoryMarkup = powerUpSource.indexOf('<section className="pupage-inventory"');
  const modalMarkup = powerUpSource.indexOf('{statsOpen && <div className="pupage-stats-backdrop"');
  assert.ok(inventoryMarkup >= 0 && modalMarkup > inventoryMarkup);
  assert.match(powerUpSource, /onClick=\{\(\) => setStatsOpen\(true\)\}/);
  assert.match(powerUpSource, /aria-haspopup="dialog"/);
  assert.match(powerUpSource, /aria-label="Close pet stats"/);
  assert.match(powerUpSource, /pupage-stat-value/);
  assert.match(powerUpSource, /if \(event\.key === "Escape"\) setStatsOpen\(false\)/);
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

