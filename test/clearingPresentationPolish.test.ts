import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("selected Clearing blessings stay compact instead of leaving a large result box", () => {
  const hud = readFileSync("client/src/components/clearing/ClearingHuntHud.tsx", "utf8");
  assert.match(hud, /const \[collapsed, setCollapsed\] = useState\(true\)/);
  assert.match(hud, /clearing-blessing-pill/);
  assert.match(hud, /Boss defeated · View rewards/);
  assert.match(hud, /complete && <div className="mt-1\.5">/);
  assert.doesNotMatch(hud, /\(complete \|\| blessing \|\| blessingAvailable\).*rounded-xl.*bg-emerald-950\/90/s);
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
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(main, /clearingEnemyAttackPolish\.css/);
});
