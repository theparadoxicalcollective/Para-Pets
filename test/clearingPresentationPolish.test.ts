import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("selected Clearing blessings stay compact instead of leaving a large result box", () => {
  const hud = readFileSync("client/src/components/clearing/ClearingHuntHud.tsx", "utf8");
  assert.match(hud, /const \[collapsed, setCollapsed\] = useState\(true\)/);
  assert.match(hud, /clearing-blessing-pill/);
  assert.match(hud, /This hunt/);
  assert.match(hud, /Boss defeated · View rewards/);
  assert.match(hud, /complete && <div className="mt-1\.5">/);
  assert.doesNotMatch(hud, /\(complete \|\| blessing \|\| blessingAvailable\).*rounded-xl.*bg-emerald-950\/90/s);
});

test("Clearing HUD and combat controls use the compact green-and-gold concept treatment", () => {
  const css = readFileSync("client/src/components/clearing/clearingHuntHud.css", "utf8");
  for (const selector of [
    'data-testid="clearing-currency-display"',
    'data-testid="button-clearing-equipment"',
    'data-testid^="button-clearing-potion-"',
    'data-testid="button-clearing-attack"',
  ]) assert.match(css, new RegExp(selector.replace(/[\[\]"^$]/g, "\\$&")));
  assert.match(css, /width: 74px !important/);
  assert.match(css, /border: 2px solid rgba\(239, 199, 84/);
  assert.match(css, /clearing-blessing-pill::before/);
  assert.match(css, /max-width: min\(84%, 250px\)/);
  assert.match(css, /@media \(max-width: 360px\), \(max-height: 700px\)/);
});

test("regular Clearing enemies animate their existing alert, windup, and recovery states", () => {
  const combat = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
  const css = readFileSync("client/src/clearingEnemyAttackPolish.css", "utf8");
  const main = readFileSync("client/src/main.tsx", "utf8");
  assert.match(combat, /data-enemy-state=\{e\.state\}/);
  assert.match(combat, /e\.state==="windup"\?"is-winding-up"/);
  assert.match(css, /data-enemy-state="alerting"/);
  assert.match(css, /is-winding-up/);
  assert.match(css, /data-enemy-state="recovering"/);
  assert.match(css, /clearing-enemy-slash/);
  assert.match(css, /clearing-enemy-impact-ring/);
  assert.match(css, /rgba\(251, 113, 61/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(main, /clearingEnemyAttackPolish\.css/);
});
